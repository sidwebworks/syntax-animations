import { BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, Quality } from "mediabunny";
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
    gutterColor: number
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
const INSTANCE_WORDS = 6;

const ITALIC = 1;
const BOLD = 2;

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
};

export type Scene = {
  duration: number;
  width: number;
  height: number;
  background: string;
  /** `ctx` should be scaled so one unit is one CSS pixel. */
  draw(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: number): void;
  dispose(): void;
};

const PADDING = 40;
const FPS = 60;
/** Output pixels per CSS pixel. */
const SCALE = 2;

export async function createScene(highlighter: Highlighter, codes: string[], o: SceneOptions): Promise<Scene> {
  const ex = await loadWasm();
  const family = `"${o.font.family}", ui-monospace, monospace`;
  const fontFor = (style: number) =>
    `${style & ITALIC ? "italic " : ""}${style & BOLD ? "bold " : ""}${o.font.size}px ${family}`;

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
  const words: number[] = [codes.length];
  for (const code of codes) {
    const result = highlighter.codeToTokens(expandTabs(code, o.tabSize), {
      lang: o.lang,
      theme: o.theme,
    });
    background = result.bg ?? background;
    foreground = parseColor(result.fg ?? "#ffffff");
    const slide: number[] = [];
    result.tokens.forEach((line, i) => {
      if (i > 0) slide.push(0, 0, 0, 0, KIND_NEWLINE);
      for (const token of line) {
        // Split into words and operator runs so a diff can match part of a token. Operators stay
        // whole so ligatures like `=>` and `!==` still render.
        for (const run of token.content.match(/\s+|[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]+/gu) ?? []) {
          const cols = columns(run);
          if (/^\s/.test(run)) slide.push(0, 0, 0, cols, KIND_SPACE);
          else {
            const color = token.color ? parseColor(token.color) : foreground;
            // Shiki uses -1 for "no font style".
            slide.push(intern(run), color, Math.max(0, token.fontStyle ?? 0), cols, KIND_TEXT);
          }
        }
      }
    });
    words.push(slide.length / 5);
    for (const w of slide) words.push(w);
  }

  const gutterColor = o.lineNumbers ? ((foreground & 0xffffff00) | 0x66) >>> 0 : 0;
  const ptr = ex.alloc_u32(words.length);
  new Uint32Array(ex.memory.buffer, ptr, words.length).set(words);
  const engine = ex.engine_new(ptr, words.length, charW, lineH, o.hold, o.transition, o.stagger, gutterColor);
  ex.free_u32(ptr, words.length);
  if (!engine) throw new Error("Engine rejected the scene");

  const css = new Map<number, string>();
  const cssColor = (c: number) => {
    let s = css.get(c);
    if (!s) css.set(c, (s = `#${c.toString(16).padStart(8, "0")}`));
    return s;
  };

  const width = Math.ceil(ex.engine_width(engine) + PADDING * 2);
  const height = Math.ceil(ex.engine_height(engine) + PADDING * 2);
  let disposed = false;

  return {
    duration: ex.engine_duration(engine),
    width,
    height,
    background,
    draw(ctx, t) {
      if (disposed) return;
      ctx.globalAlpha = 1;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
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
        const isNumber = (style & STYLE_LINE_NUMBER) !== 0;
        const fontStyle = isNumber ? 0 : style;
        if (fontStyle !== font) ctx.font = fontFor((font = fontStyle));
        ctx.globalAlpha = f32[at + 5];
        ctx.fillStyle = cssColor(u32[at + 1]);
        const text = isNumber ? String(u32[at]) : texts[u32[at]];
        ctx.fillText(text, PADDING + f32[at + 3], PADDING + f32[at + 4] + lineH / 2);
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

export async function renderMp4(
  scene: Scene,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (progress: number, t: number) => void } = {}
) {
  // H.264 needs even dimensions.
  const width = Math.ceil((scene.width * SCALE) / 2) * 2;
  const height = Math.ceil((scene.height * SCALE) / 2) * 2;

  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width, height });
  if (!codec) throw new Error(`This browser can't encode ${width}×${height} video`);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(width / scene.width, height / scene.height);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, quality: new Quality("very-high") });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();

  const frames = Math.ceil(scene.duration * FPS) + 1;
  try {
    for (let f = 0; f < frames; f++) {
      signal?.throwIfAborted();
      const t = f / FPS;
      scene.draw(ctx, t);
      await source.add(t, 1 / FPS);
      onProgress?.((f + 1) / frames, t);
    }
    await output.finalize();
    signal?.throwIfAborted();
  } catch (error) {
    await output.cancel();
    throw error;
  }

  return new Blob([output.target.buffer!], { type: "video/mp4" });
}

let segmenter: Intl.Segmenter | undefined;
const WIDE =
  /\p{Emoji_Presentation}|️|[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3FFFD}]/u;

/** Monospace columns, the way editors count them: CJK and emoji take two. */
function columns(text: string) {
  let n = 0;
  for (const { segment } of (segmenter ??= new Intl.Segmenter()).segment(text)) n += WIDE.test(segment) ? 2 : 1;
  return n;
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
