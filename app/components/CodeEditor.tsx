import { Editor, type BeforeMount, type OnChange, type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useState } from "react";
import { useSettingsStore, useTimelineStore } from "~/lib/store";
import { cn } from "~/lib/utils";

interface Props {
  isBlurred?: boolean;
}

const EDITOR_OPTIONS = {
  cursorStyle: "line",
  trimAutoWhitespace: true,
  trimWhitespaceOnDelete: true,
  minimap: { enabled: false },
  fontFamily: "Fira Code",
  fontLigatures: true,
  "semanticHighlighting.enabled": false,
  fontSize: 16,
} as editor.IStandaloneEditorConstructionOptions;

export function CodeEditor() {
  const [blurred, setBlurred] = useState(false);
  const { language, theme } = useSettingsStore();
  const item = useTimelineStore((s) => s.slides[s.active]);

  const onMount: OnMount = (editor, monaco) => {
    const model = editor.getModel();
    monaco.editor.setModelLanguage(model!, language);

    let timer: NodeJS.Timeout;

    editor.onWillChangeModel((ev) => {
      setBlurred(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setBlurred(false), 300);
    });
  };

  const onBeforeMount: BeforeMount = async (monaco) => {
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
    });
  };

  const onChange: OnChange = (e) => {};

  return (
    <div className="relative w-full isolate h-full">
      <Editor
        saveViewState
        className={cn(
          "w-full h-full transition-[filter] ease-out duration-500",
          blurred && "blur-[2px] pointer-events-none"
        )}
        loading={null}
        theme={theme}
        language={language}
        path={item.uri}
        keepCurrentModel
        options={EDITOR_OPTIONS}
        onMount={onMount}
        onChange={onChange}
        beforeMount={onBeforeMount}
      />
    </div>
  );
}
