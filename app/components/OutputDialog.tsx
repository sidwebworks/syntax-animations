import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { renderMp4 } from "~/lib/engine";
import { allSlideCode } from "~/lib/slides";
import { play, useScene, useSceneCanvas } from "./scene";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

export type Output = "play" | "export";

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
  const [codes] = useState(allSlideCode);
  const { scene, error } = useScene(codes);
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
  const [codes] = useState(allSlideCode);
  const { scene, error } = useScene(codes);
  const { ref, draw } = useSceneCanvas(scene);
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<string>();
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!scene) return;
    const abort = new AbortController();
    renderMp4(scene, {
      signal: abort.signal,
      onProgress: (p, t) => {
        draw(t);
        setProgress(Math.floor(p * 100));
      },
    }).then(
      (video) => {
        download(video, "syntax-animation.mp4");
        done.current();
      },
      (e) => abort.signal.aborted || setFailure(e instanceof Error ? e.message : String(e))
    );

    return () => abort.abort();
  }, [scene, draw]);

  return (
    <Stage canvas={<canvas ref={ref} className="h-full w-full object-contain" />} background={scene?.background}>
      {error || failure ? (
        <p className="text-destructive">{error || failure}</p>
      ) : (
        <>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full origin-left bg-primary" style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <span className="w-24 text-right font-mono tabular-nums text-muted-foreground">
            {scene ? `${progress}%` : "preparing"}
          </span>
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

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
