import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { renderVideo } from "~/lib/engine";
import { useSettings } from "~/lib/settings";
import { download } from "~/lib/utils";
import { allSlides } from "~/lib/slides";
import { play, useScene, useSceneCanvas } from "./scene";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Segmented } from "./ui/segmented";

export type Output = "play" | "export";

const RESOLUTIONS = [
  [720, "720p"],
  [1080, "1080p"],
  [2160, "4K"],
] as const;
const FRAME_RATES = [
  [30, "30 fps"],
  [60, "60 fps"],
] as const;
const FORMATS = [
  ["mp4", "MP4"],
  ["webm", "WebM"],
] as const;

export function OutputDialog({ output, onClose }: { output?: Output; onClose: () => void }) {
  return (
    <Dialog open={!!output} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="h-[85%] w-[85%] max-w-none! flex flex-col gap-0 overflow-hidden border-none p-0"
      >
        <DialogTitle className="sr-only">{output === "export" ? "Export video" : "Play animation"}</DialogTitle>
        {output === "play" && <Player />}
        {output === "export" && <Exporter onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Player() {
  const [slides] = useState(allSlides);
  const { scene, error } = useScene(slides);
  const { ref, draw } = useSceneCanvas(scene);
  const scrub = useRef<HTMLInputElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const stop = useRef<() => void>(undefined);

  const show = useCallback(
    (t: number) => {
      draw(t);
      if (scrub.current) scrub.current.value = String(t);
      if (clock.current) clock.current.textContent = `${t.toFixed(2)}s / ${scene?.duration.toFixed(2)}s`;
    },
    [draw, scene]
  );

  const replay = useCallback(() => {
    stop.current?.();
    if (scene) stop.current = play(scene.duration, show);
  }, [scene, show]);

  useEffect(() => {
    replay();
    return () => stop.current?.();
  }, [replay]);

  return (
    <Stage canvas={<canvas ref={ref} className="h-full w-full object-contain" />} background={scene?.background}>
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <>
          <button
            type="button"
            onClick={replay}
            className="rounded-md border px-3 py-1.5 transition-transform duration-150 active:scale-[0.97]"
          >
            Replay
          </button>
          <input
            ref={scrub}
            type="range"
            min={0}
            max={scene?.duration ?? 0}
            step={0.001}
            defaultValue={0}
            onInput={(e) => {
              stop.current?.();
              show(Number(e.currentTarget.value));
            }}
            className="flex-1 accent-primary"
            aria-label="Timeline"
          />
          <span ref={clock} className="font-mono tabular-nums text-muted-foreground" />
        </>
      )}
    </Stage>
  );
}

function Exporter({ onDone }: { onDone: () => void }) {
  const [slides] = useState(allSlides);
  const { scene, error } = useScene(slides);
  const { ref, draw } = useSceneCanvas(scene);
  const { resolution, fps, format, onSettingChange } = useSettings();
  const [music, setMusic] = useState<{ name: string; buffer: AudioBuffer }>();
  const [progress, setProgress] = useState<number>();
  const [failure, setFailure] = useState<string>();
  const abort = useRef<AbortController>(undefined);

  useEffect(() => () => abort.current?.abort(), []);

  async function pickMusic(file: File | undefined) {
    if (!file) return setMusic(undefined);
    try {
      const buffer = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await file.arrayBuffer());
      setMusic({ name: file.name, buffer });
    } catch {
      setFailure(`Couldn't read ${file.name} as audio`);
    }
  }

  async function start() {
    if (!scene) return;
    abort.current = new AbortController();
    const { signal } = abort.current;
    setFailure(undefined);
    setProgress(0);
    try {
      const video = await renderVideo(scene, {
        resolution,
        fps,
        format,
        music: music?.buffer,
        signal,
        onProgress: (p, t) => {
          draw(t);
          setProgress(Math.floor(p * 100));
        },
      });
      download(video, `syntax-animation.${format}`);
      onDone();
    } catch (e) {
      if (signal.aborted) return;
      setProgress(undefined);
      setFailure(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Stage canvas={<canvas ref={ref} className="h-full w-full object-contain" />} background={scene?.background}>
      {progress !== undefined ? (
        <>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full origin-left bg-primary" style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <span className="w-24 text-right font-mono tabular-nums text-muted-foreground">{progress}%</span>
        </>
      ) : (
        <>
          <Segmented
            label="Resolution"
            value={resolution}
            options={RESOLUTIONS}
            onChange={(v) => onSettingChange("resolution", v)}
          />
          <Segmented
            label="Frame rate"
            value={fps}
            options={FRAME_RATES}
            onChange={(v) => onSettingChange("fps", v)}
          />
          <Segmented
            label="Format"
            value={format}
            options={FORMATS}
            onChange={(v) => onSettingChange("format", v)}
          />
          <label className="flex min-w-0 cursor-pointer items-center gap-2 text-muted-foreground">
            <span className="rounded-md border px-3 py-1.5 transition-colors hover:text-foreground">
              {music ? "Change music" : "Add music"}
            </span>
            <span className="truncate text-xs">{music?.name}</span>
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={(e) => pickMusic(e.currentTarget.files?.[0])}
            />
          </label>
          {failure || error ? <p className="min-w-0 truncate text-destructive">{failure || error}</p> : null}
          <button
            type="button"
            disabled={!scene}
            onClick={start}
            className="ml-auto rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground transition-transform duration-150 active:scale-[0.97] disabled:opacity-50"
          >
            Export
          </button>
        </>
      )}
    </Stage>
  );
}

function Stage({ canvas, background, children }: { canvas: ReactNode; background?: string; children: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col" style={{ background }}>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">{canvas}</div>
      <div className="flex items-center gap-4 border-t bg-background px-5 py-3 text-sm">{children}</div>
    </div>
  );
}
