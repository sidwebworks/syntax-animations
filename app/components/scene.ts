import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CODE_FONT, TAB_SIZE } from "~/lib/code-style";
import { editor } from "~/lib/editor";
import { createScene, type Scene } from "~/lib/engine";
import { useSettings } from "~/lib/settings";

/** `hold` overrides the slide interval setting. */
export function useScene(codes: string[] | undefined, hold?: number) {
  const { language, theme, slideInterval, transition, stagger, lineNumbers } = useSettings();
  const [scene, setScene] = useState<Scene>();
  const [error, setError] = useState<string>();
  const key = codes && JSON.stringify(codes);
  hold ??= slideInterval;

  useEffect(() => {
    if (!codes) return;
    let built: Scene | undefined;
    let stale = false;
    setError(undefined);

    createScene(editor().highlighter, codes, {
      lang: language,
      theme,
      font: CODE_FONT,
      tabSize: TAB_SIZE,
      hold,
      transition,
      stagger,
      lineNumbers,
    }).then(
      (s) => {
        if (stale) return s.dispose();
        built = s;
        setScene(s);
      },
      (e) => stale || setError(e instanceof Error ? e.message : String(e))
    );

    return () => {
      stale = true;
      built?.dispose();
    };
  }, [key, language, theme, hold, transition, stagger, lineNumbers]);

  return { scene, error };
}

export function useSceneCanvas(scene: Scene | undefined) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctx = useRef<CanvasRenderingContext2D>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!scene || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(scene.width * dpr);
    canvas.height = Math.round(scene.height * dpr);
    // fillText picks up CSS letter-spacing from the page; the engine's columns assume none.
    canvas.style.letterSpacing = "0";
    ctx.current = canvas.getContext("2d")!;
    ctx.current.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Resizing clears the canvas; draw now so it's never painted empty.
    scene.draw(ctx.current, 0);
  }, [scene]);

  const draw = useCallback((t: number) => scene && ctx.current && scene.draw(ctx.current, t), [scene]);

  return { ref, draw };
}

/** Returns a function that stops playback. */
export function play(duration: number, frame: (t: number) => void) {
  const start = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const t = Math.min((now - start) / 1000, duration);
    frame(t);
    if (t < duration) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
