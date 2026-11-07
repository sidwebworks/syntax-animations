import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  type AudioCodec,
  type VideoCodec,
} from "mediabunny";
import type { BundledLanguage, BundledTheme, Highlighter } from "shiki";
import wasmUrl from "./engine.wasm?url";

// Mirrors the `ffi` module in engine/src/lib.rs. Rebuild with `pnpm build:engine`.
type Exports = {
  memory: WebAssembly.Memory;
  alloc_u32(len: number): number;
  free_u32(ptr: number, len: number): void;
  engine_new(
    ptr: number,
    len: number,
    charW: number,
    lineH: number,
    hold: number,
    transition: number,
    stagger: number,
    gutterColor: number,
    cursorColor: number
  ): number;
  engine_free(engine: number): void;
  engine_duration(engine: number): number;
  engine_width(engine: number): number;
  engine_height(engine: number): number;
  engine_evaluate(engine: number, t: number): number;
  engine_output(engine: number): number;
};

const KIND_TEXT = 0;
const KIND_SPACE = 1;
const KIND_NEWLINE = 2;
const STYLE_LINE_NUMBER = 1 << 8;
const STYLE_CURSOR = 1 << 9;
const INSTANCE_WORDS = 7;

// Shiki's FontStyle flags, which it only exports as a type.
const ITALIC = 1;
const BOLD = 2;

/** Space between the code and the edge of its window. */
const INSET = 28;
const TITLE_BAR = 36;
const RADIUS = 12;

export function isSupported() {
  return (
    typeof VideoEncoder === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof WebAssembly === "object" &&
    typeof Intl.Segmenter === "function"
  );
}

let wasm: Promise<Exports> | undefined;
const loadWasm = () =>
  (wasm ??= fetch(wasmUrl)
    .then((r) => r.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes))
    .then(({ instance }) => instance.exports as unknown as Exports));

type SceneSlide = {
  code: string;
  /** Seconds, overriding `SceneOptions.hold`. */
  hold?: number;
  /** 1-based inclusive line ranges to keep bright. */
  focus?: [number, number][];
};

type SceneOptions = {
  lang: BundledLanguage;
  theme: BundledTheme;
  font: { family: string; size: number; lineHeight: number };
  tabSize: number;
  /** Seconds each slide stays still. */
  hold: number;
  /** Seconds each transition takes. */
  transition: number;
  stagger: number;
  lineNumbers: boolean;
  typing: boolean;
  frame: {
    /** Width over height, or null to wrap the code. */
    aspect: number | null;
    /** Gradient stops behind the window; empty uses the theme's background. */
    background: string[];
    /** Pixels between the window and the edge. */
    padding: number;
    /** Draws a title bar with this title, or nothing when null. */
    title: string | null;
  };
};

export type Scene = {
  duration: number;
  width: number;
  height: number;
  background: string;
  /** `ctx` should be scaled so one unit is one CSS pixel. */
  draw(ctx: Ctx, t: number): void;
  dispose(): void;
};

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export async function createScene(highlighter: Highlighter, slides: SceneSlide[], o: SceneOptions): Promise<Scene> {
  const ex = await loadWasm();
  const family = `"${o.font.family}", ui-monospace, monospace`;
  const fontFor = (style: number, size = o.font.size) =>
    `${style & ITALIC ? "italic " : ""}${style & BOLD ? "bold " : ""}${size}px ${family}`;

  // Columns are measured once, so the real font has to be loaded first.
  await Promise.all([document.fonts.load(fontFor(0)), document.fonts.load(fontFor(BOLD))]);
  const measure = new OffscreenCanvas(1, 1).getContext("2d")!;
  measure.font = fontFor(0);
  const charW = measure.measureText("M").width;
  const lineH = Math.round(o.font.size * o.font.lineHeight);

  const texts: string[] = [""];
  const ids = new Map<string, number>();
  const intern = (s: string) => {
    let id = ids.get(s);
    if (id === undefined) ids.set(s, (id = texts.push(s) - 1));
    return id;
  };

  let background = "#000000";
  let foreground = 0xffffffff;
  const words: number[] = [slides.length];
  for (const slide of slides) {
    const result = highlighter.codeToTokens(expandTabs(slide.code, o.tabSize), { lang: o.lang, theme: o.theme });
    background = result.bg ?? background;
    foreground = parseColor(result.fg ?? "#ffffff");

    const focus = slide.focus ?? [];
    words.push(f32Bits(slide.hold ?? -1), focus.length);
    for (const [start, end] of focus) words.push(start - 1, end - 1);

    const tokens: number[] = [];
    result.tokens.forEach((line, i) => {
      if (i > 0) tokens.push(0, 0, 0, 0, KIND_NEWLINE);
      for (const token of line) {
        // Split into words and operator runs so a diff can match part of a token. Operators stay
        // whole so ligatures like `=>` and `!==` still render.
        for (const run of token.content.match(/\s+|[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]+/gu) ?? []) {
          const cols = columns(run);
          if (/^\s/.test(run)) tokens.push(0, 0, 0, cols, KIND_SPACE);
          else {
            const color = token.color ? parseColor(token.color) : foreground;
            // Shiki uses -1 for "no font style".
            tokens.push(intern(run), color, Math.max(0, token.fontStyle ?? 0), cols, KIND_TEXT);
          }
        }
      }
    });
    words.push(tokens.length / 5);
    for (const w of tokens) words.push(w);
  }

  const gutterColor = o.lineNumbers ? withAlpha(foreground, 0x66) : 0;
  const cursorColor = o.typing ? foreground : 0;
  const ptr = ex.alloc_u32(words.length);
  new Uint32Array(ex.memory.buffer, ptr, words.length).set(words);
  const engine = ex.engine_new(ptr, words.length, charW, lineH, o.hold, o.transition, o.stagger, gutterColor, cursorColor);
  ex.free_u32(ptr, words.length);
  if (!engine) throw new Error("Engine rejected the scene");

  const css = new Map<number, string>();
  const cssColor = (c: number) => {
    let s = css.get(c);
    if (!s) css.set(c, (s = `#${c.toString(16).padStart(8, "0")}`));
    return s;
  };

  // The code sits in a window, the window sits on the background.
  const bar = o.frame.title === null ? 0 : TITLE_BAR;
  const win = {
    w: Math.ceil(ex.engine_width(engine)) + INSET * 2,
    h: Math.ceil(ex.engine_height(engine)) + INSET * 2 + bar,
  };
  let width = win.w + o.frame.padding * 2;
  let height = win.h + o.frame.padding * 2;
  if (o.frame.aspect) {
    if (width / height < o.frame.aspect) width = Math.ceil(height * o.frame.aspect);
    else height = Math.ceil(width / o.frame.aspect);
  }
  const wx = Math.round((width - win.w) / 2);
  const wy = Math.round((height - win.h) / 2);
  const plain = o.frame.background.length === 0;

  function drawFrame(ctx: Ctx) {
    if (plain) ctx.fillStyle = background;
    else {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      o.frame.background.forEach((c, i, all) => gradient.addColorStop(i / Math.max(1, all.length - 1), c));
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, width, height);

    if (!plain || bar) {
      ctx.save();
      if (!plain) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = 48;
        ctx.shadowOffsetY = 18;
      }
      ctx.fillStyle = background;
      ctx.beginPath();
      ctx.roundRect(wx, wy, win.w, win.h, RADIUS);
      ctx.fill();
      ctx.restore();
    }

    if (bar) {
      ["#ff5f57", "#febc2e", "#28c840"].forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(wx + 20 + i * 20, wy + bar / 2, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      if (o.frame.title) {
        ctx.font = fontFor(0, 13);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = cssColor(withAlpha(foreground, 0x99));
        ctx.fillText(o.frame.title, wx + win.w / 2, wy + bar / 2);
        ctx.textAlign = "start";
      }
    }
  }

  const x0 = wx + INSET;
  const y0 = wy + INSET + bar;
  let disposed = false;

  return {
    duration: ex.engine_duration(engine),
    width,
    height,
    background,
    draw(ctx, t) {
      if (disposed) return;
      ctx.globalAlpha = 1;
      drawFrame(ctx);
      ctx.textBaseline = "middle";

      const count = ex.engine_evaluate(engine, t);
      // Growing Wasm memory detaches old views, so take fresh ones every frame.
      const base = ex.engine_output(engine) >>> 2;
      const u32 = new Uint32Array(ex.memory.buffer);
      const f32 = new Float32Array(ex.memory.buffer);

      let font = -1;
      for (let i = 0; i < count; i++) {
        const at = base + i * INSTANCE_WORDS;
        const style = u32[at + 2];
        const x = x0 + f32[at + 3];
        const y = y0 + f32[at + 4];
        ctx.globalAlpha = f32[at + 5];
        ctx.fillStyle = cssColor(u32[at + 1]);

        const reveal = f32[at + 6];
        if (style & STYLE_CURSOR) {
          const typed = columns(typedPrefix(texts[u32[at]], reveal));
          ctx.fillRect(x + typed * charW, y + lineH * 0.15, 2, lineH * 0.7);
          continue;
        }
        const isNumber = (style & STYLE_LINE_NUMBER) !== 0;
        const fontStyle = isNumber ? 0 : style;
        if (fontStyle !== font) ctx.font = fontFor((font = fontStyle));
        const text = isNumber ? String(u32[at]) : texts[u32[at]];
        ctx.fillText(reveal === Infinity ? text : typedPrefix(text, reveal), x, y + lineH / 2);
      }
      ctx.globalAlpha = 1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ex.engine_free(engine);
    },
  };
}

type VideoOptions = {
  /** Short side of the video, in pixels. */
  resolution: number;
  fps: number;
  format: "mp4" | "webm";
  /** Trimmed to the video and faded out at the end. */
  music?: AudioBuffer;
  signal?: AbortSignal;
  onProgress?: (progress: number, t: number) => void;
};

const CODECS = {
  mp4: { format: () => new Mp4OutputFormat({ fastStart: "in-memory" }), video: ["avc", "vp9", "av1"], audio: ["aac", "opus"] },
  webm: { format: () => new WebMOutputFormat(), video: ["vp9", "av1", "vp8"], audio: ["opus", "vorbis"] },
} satisfies Record<VideoOptions["format"], { format: () => unknown; video: VideoCodec[]; audio: AudioCodec[] }>;

/** Encodes every frame offscreen, as fast as the encoder allows. */
export async function renderVideo(scene: Scene, { resolution, fps, format, music, signal, onProgress }: VideoOptions) {
  // `resolution` sets the short side, but a very wide or tall frame is capped at 16:9 of it.
  const scale = Math.min(
    resolution / Math.min(scene.width, scene.height),
    (resolution * 16) / 9 / Math.max(scene.width, scene.height)
  );
  // Most encoders need even dimensions.
  const width = Math.round((scene.width * scale) / 2) * 2;
  const height = Math.round((scene.height * scale) / 2) * 2;
  const codecs = CODECS[format];

  const codec = await getFirstEncodableVideoCodec(codecs.video, { width, height });
  if (!codec) throw new Error(`This browser can't encode ${width}×${height} ${format.toUpperCase()} video`);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(width / scene.width, height / scene.height);

  const output = new Output({ format: codecs.format(), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec, quality: new Quality("very-high") });
  output.addVideoTrack(video, { frameRate: fps });

  let audio: { source: AudioBufferSource; buffer: AudioBuffer } | undefined;
  if (music) {
    const buffer = await fitAudio(music, scene.duration);
    const audioCodec = await getFirstEncodableAudioCodec(codecs.audio, {
      numberOfChannels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
    });
    if (!audioCodec) throw new Error(`This browser can't encode audio for ${format.toUpperCase()}`);
    audio = { source: new AudioBufferSource({ codec: audioCodec, quality: new Quality("high") }), buffer };
    output.addAudioTrack(audio.source);
  }

  await output.start();
  const frames = Math.ceil(scene.duration * fps) + 1;
  try {
    if (audio) await audio.source.add(audio.buffer);
    for (let f = 0; f < frames; f++) {
      signal?.throwIfAborted();
      const t = f / fps;
      scene.draw(ctx, t);
      await video.add(t, 1 / fps);
      onProgress?.((f + 1) / frames, t);
    }
    await output.finalize();
    signal?.throwIfAborted();
  } catch (error) {
    await output.cancel();
    throw error;
  }

  return new Blob([output.target.buffer!], { type: output.format.mimeType });
}

/** `music` cut to `duration` seconds with a short fade at the end. */
async function fitAudio(music: AudioBuffer, duration: number) {
  const rate = 48000;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * rate)), rate);
  const source = ctx.createBufferSource();
  source.buffer = music;
  const gain = ctx.createGain();
  const fade = Math.min(1.5, duration / 4);
  gain.gain.setValueAtTime(1, Math.max(0, duration - fade));
  gain.gain.linearRampToValueAtTime(0, duration);
  source.connect(gain).connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

let segmenter: Intl.Segmenter | undefined;
const graphemes = (text: string) => [...(segmenter ??= new Intl.Segmenter()).segment(text)].map((s) => s.segment);

const WIDE =
  /\p{Emoji_Presentation}|️|[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3FFFD}]/u;
const cellWidth = (g: string) => (WIDE.test(g) ? 2 : 1);

/** Monospace columns, the way editors count them: CJK and emoji take two. */
function columns(text: string) {
  return graphemes(text).reduce((n, g) => n + cellWidth(g), 0);
}

/** The start of `text` that fits in `budget` columns. */
function typedPrefix(text: string, budget: number) {
  let used = 0;
  let out = "";
  for (const g of graphemes(text)) {
    if ((used += cellWidth(g)) > budget) break;
    out += g;
  }
  return out;
}

/** Tabs become spaces up to the next tab stop, the way the editor shows them. */
function expandTabs(code: string, tabSize: number) {
  return code.replace(/^.*\t.*$/gm, (line) => {
    let out = "";
    for (const ch of line) out += ch === "\t" ? " ".repeat(tabSize - (columns(out) % tabSize)) : ch;
    return out;
  });
}

function parseColor(hex: string) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (h.length === 6) h += "ff";
  const n = Number.parseInt(h, 16);
  return Number.isNaN(n) ? 0xffffffff : n >>> 0;
}

const withAlpha = (color: number, alpha: number) => ((color & 0xffffff00) | alpha) >>> 0;

const f32Bits = (n: number) => new Uint32Array(new Float32Array([n]).buffer)[0];
