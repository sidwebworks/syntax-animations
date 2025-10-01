import { useIsomorphicLayoutEffect } from "@dnd-kit/utilities";
import { Editor, type BeforeMount, type OnChange, type OnMount } from "@monaco-editor/react";
import { Loader } from "lucide-react";
import type { editor } from "monaco-editor";
import { useEffect, useRef, useState } from "react";
import { EditorStatus, useEditorStore, useSettingsStore, useTimelineStore } from "~/lib/store";
import { cn } from "~/lib/utils";

interface Props {}

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

export function CodeEditor(props: Props) {
  const [blurred, setBlurred] = useState(false);
  const { language, theme } = useSettingsStore();
  const { active } = useTimelineStore();
  const item = useTimelineStore((s) => s.slides[s.active]);

  useEffect(() => {
    setBlurred(true);
    const timer = setTimeout(() => setBlurred(false), 500);
    return () => {
      clearTimeout(timer);
    };
  }, [active]);

  const onMount: OnMount = (editor, monaco) => {
    const model = editor.getModel()
    monaco.editor.setModelLanguage(model!, language)
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
        className={cn("w-full h-full transition-[filter] duration-500", blurred && "blur-[2px] pointer-events-none")}
        loading={<Loader className="animate-spin duration-200" />}
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
