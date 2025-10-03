import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { useEditorStore, useSettingsStore, useTimelineStore } from "~/lib/store";
import { ShikiMagicMove } from "./ShikiRenderer";

function PreviewSlide() {
  const [code, setCode] = useState("");
  const { language, theme, moveOptions } = useSettingsStore();
  const { highlighter, monaco } = useEditorStore();
  const { active } = useTimelineStore();

  const onChange = useDebouncedCallback((code: string) => setCode(code), { delay: 800 });

  useEffect(() => {
    if (!monaco) return;

    const uri = monaco.Uri.parse(`file://${active}/`);
    const model = monaco.editor.getModel(uri);

    if (!model) return;

    setCode(model.getValue());

    const disposable = model.onDidChangeContent(() => onChange(model.getValue()));

    return () => disposable.dispose();
  }, [active, monaco]);

  const key = `${language}_${theme}`;

  const trimmed = useMemo(() => code.split("\n").slice(0, 100).join("\n"), [code]);

  return (
    <div className="h-full w-full isolate transform-flat will-change-transform font-mono">
      <ShikiMagicMove
        key={key}
        lang={language}
        theme={theme}
        highlighter={highlighter!}
        code={trimmed}
        className="h-full w-full p-4 overflow-auto font-mono!"
        options={moveOptions}
      />
    </div>
  );
}

export default PreviewSlide;
