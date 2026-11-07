import { Editor, type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useState } from "react";
import { CODE_FONT, TAB_SIZE } from "~/lib/code-style";
import { useSettings } from "~/lib/settings";
import { slidePath, useSlides } from "~/lib/slides";
import { cn } from "~/lib/utils";

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  cursorStyle: "line",
  trimAutoWhitespace: true,
  minimap: { enabled: false },
  fontFamily: CODE_FONT.family,
  fontSize: CODE_FONT.size,
  lineHeight: CODE_FONT.lineHeight,
  tabSize: TAB_SIZE,
  fontLigatures: true,
  "semanticHighlighting.enabled": false,
};

export function CodeEditor() {
  const [switching, setSwitching] = useState(false);
  const { language, theme } = useSettings();
  const active = useSlides((s) => s.active);

  // Blur briefly while switching slides so the model swap doesn't flash.
  const onMount: OnMount = (editor) => {
    let timer: ReturnType<typeof setTimeout>;
    editor.onWillChangeModel(() => {
      setSwitching(true);
      clearTimeout(timer);
      timer = setTimeout(() => setSwitching(false), 300);
    });
  };

  return (
    <div className="relative w-full isolate h-full">
      <Editor
        saveViewState
        className={cn(
          "w-full h-full transition-[filter] ease-out duration-500",
          switching && "blur-[2px] pointer-events-none"
        )}
        loading={null}
        theme={theme}
        language={language}
        path={slidePath(active)}
        keepCurrentModel
        options={EDITOR_OPTIONS}
        onMount={onMount}
      />
    </div>
  );
}
