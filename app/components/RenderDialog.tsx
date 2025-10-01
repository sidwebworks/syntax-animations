import { useEffect, useMemo, useRef, useState } from "react";
import { useScreenRecorder } from "~/lib/hooks";
import { EditorStatus, useEditorStore, useSettingsStore, useTimelineStore } from "~/lib/store";
import { sleep } from "~/lib/utils";
import { ShikiMagicMove } from "./ShikiRenderer";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

function RenderDialog() {
  const { onSettingChange } = useSettingsStore();

  return (
    <Dialog defaultOpen onOpenChange={(v) => onSettingChange("enableRenderPanel", v)}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="h-[85%] w-[85%] overflow-auto max-w-none! items-start flex flex-col gap-0 p-0 border-none"
      >
        <DialogTitle className="sr-only absolute">Output Render</DialogTitle>
        <Content />
      </DialogContent>
    </Dialog>
  );
}

function Content() {
  const [code, setCode] = useState("");
  const { language, theme, moveOptions, onSettingChange } = useSettingsStore();
  const { highlighter, monaco, setStatus } = useEditorStore();
  const { slides, order } = useTimelineStore();
  const renderRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(false);
  const recorder = useScreenRecorder();

  const onEnd = async () => {
    setStatus(EditorStatus.Idle);
    setCode("");
    recorder.stopRecording(renderRef);
    onSettingChange("enableRenderPanel", false);
  };

  const onStart = async () => {
    setStatus(EditorStatus.Animating);
    await sleep(1000);
    await recorder.startRecording(renderRef);
  };

  const play = async () => {
    if (!monaco) return;

    try {
      await onStart();

      for (const id of order) {
        const slide = slides[id];
        const model = monaco.editor.getModel(monaco.Uri.parse(slide.uri))!;
        const text = model.getValue();
        setCode(text);
        await sleep(moveOptions.slideInterval);
      }

      await sleep(moveOptions.slideInterval);

      await onEnd();
    } catch (error) {
      console.error(error);
    } finally {
    }
  };

  useEffect(() => {
    if (!renderRef.current || playingRef.current) return;

    playingRef.current = true;

    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = useMemo(() => code.split("\n").slice(0, 100).join("\n"), [code]);

  return (
    <div ref={renderRef} className="h-full w-full isolate transform-flat will-change-transform font-mono">
      <ShikiMagicMove
        key={`${language}_${theme}`}
        lang={language}
        theme={theme}
        highlighter={highlighter!}
        code={trimmed}
        className="h-full w-full p-4 font-mono! overflow-auto"
        options={moveOptions}
      />
    </div>
  );
}

export default RenderDialog;
