import { useEffect, useState } from "react";
import { slideCode, useSlides, watchSlide } from "~/lib/slides";
import { play, useScene, useSceneCanvas } from "./scene";

const EDIT_DELAY = 800;

/** The open slide, animating from whatever was shown before whenever it changes. */
function PreviewSlide() {
  const active = useSlides((s) => s.active);
  const [codes, setCodes] = useState<[string, string]>();

  useEffect(() => {
    const show = (code: string) => setCodes((prev) => [prev?.[1] ?? code, code]);
    show(slideCode(active));

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unwatch = watchSlide(active, (code) => {
      clearTimeout(timer);
      timer = setTimeout(() => show(code), EDIT_DELAY);
    });
    return () => {
      clearTimeout(timer);
      unwatch();
    };
  }, [active]);

  const { scene, error } = useScene(codes, 0);
  const { ref, draw } = useSceneCanvas(scene);

  useEffect(() => (scene ? play(scene.duration, draw) : undefined), [scene, draw]);

  return (
    <div className="relative h-full w-full overflow-auto" style={{ background: scene?.background }}>
      <canvas ref={ref} className="max-w-full" style={{ width: scene?.width }} />
      {error && <p className="absolute bottom-0 p-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}

export default PreviewSlide;
