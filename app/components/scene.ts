import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CODE_FONT, TAB_SIZE } from "~/lib/code-style";
import { editor } from "~/lib/editor";
import { createScene, type Scene } from "~/lib/engine";
import { ASPECTS, BACKGROUNDS, useSettings } from "~/lib/settings";
import { parseLineRanges, type SlideData } from "~/lib/slides";

/** `hold` overrides every slide's hold time. */
export function useScene(slides: SlideData[] | undefined, hold?: number) {
  const settings = useSettings();
  const [scene, setScene] = useState<Scene>();
  const [error, setError] = useState<string>();
  const options = {
    lang: settings.language,
    theme: settings.theme,
    font: CODE_FONT,
    tabSize: TAB_SIZE,
    hold: hold ?? settings.slideInterval,
    transition: settings.transition,
    stagger: settings.stagger,
    lineNumbers: settings.lineNumbers,
    typing: settings.typing,
    frame: {
      aspect: ASPECTS[settings.aspect],
      background: BACKGROUNDS[settings.background],
      padding: settings.padding,
      title: settings.windowChrome ? settings.title : null,
    },
  };
  const key = slides && JSON.stringify([slides, hold, options]);

  useEffect(() => {
    if (!slides) return;
    let built: Scene | undefined;
    let stale = false;
    setError(undefined);

    const input = slides.map((s) => ({
      code: s.code,
      hold: hold ?? s.hold,
      focus: parseLineRanges(s.focus),
    }));
    createScene(editor().highlighter, input, options).then(
      (s) => {
        if (stale) return s.dispose();
        built = s;
        setScene(s);
      },
      (e) => {
        if (stale) return;
        setScene(undefined);
        setError(e instanceof Error ? e.message : String(e));
      }
    );

    return () => {
      stale = true;
      built?.dispose();
    };
    // `key` covers everything the scene is built from.
  }, [key]);

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
