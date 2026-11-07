import { loader, type Monaco } from "@monaco-editor/react";
import { shikiToMonaco } from "@shikijs/monaco";
import { version as monacoVersion } from "monaco-editor/package.json";
import { createHighlighter, createOnigurumaEngine, type BundledLanguage, type BundledTheme, type Highlighter } from "shiki";
import { toast } from "sonner";
import { create } from "zustand";
import { useSettings } from "./settings";

export const useEditorLoading = create<{ loading?: "grammar" | "theme" }>(() => ({}));

let instance: { monaco: Monaco; highlighter: Highlighter } | undefined;

export function editor() {
  if (!instance) throw new Error("setupEditor() hasn't finished");
  return instance;
}

export async function setupEditor() {
  // Monaco runs from the CDN; the npm package only provides its types.
  loader.config({ paths: { vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${monacoVersion}/min/vs` } });

  const { language, theme } = useSettings.getState();
  const [monaco, highlighter] = await Promise.all([
    loader.init(),
    createHighlighter({
      langs: [language],
      themes: [theme],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    }),
  ]);

  instance = { monaco, highlighter };
  monaco.languages.register({ id: language });
  shikiToMonaco(highlighter, monaco);

  // Slides are snippets, so type errors against missing imports are just noise.
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true });
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true });
}

export async function setLanguage(language: BundledLanguage) {
  const { monaco, highlighter } = editor();
  useEditorLoading.setState({ loading: "grammar" });
  try {
    await highlighter.loadLanguage(language);
    monaco.languages.register({ id: language });
    shikiToMonaco(highlighter, monaco);
    for (const model of monaco.editor.getModels()) monaco.editor.setModelLanguage(model, language);
    // shikiToMonaco redefines every theme, so the current one has to be applied again.
    monaco.editor.setTheme(useSettings.getState().theme);
    useSettings.getState().onSettingChange("language", language);
  } catch (e) {
    toast(`Failed to change language to ${language}: ${e instanceof Error ? e.message : e}`);
  } finally {
    useEditorLoading.setState({ loading: undefined });
  }
}

export async function setTheme(theme: BundledTheme) {
  const { monaco, highlighter } = editor();
  useEditorLoading.setState({ loading: "theme" });
  try {
    await highlighter.loadTheme(theme);
    shikiToMonaco(highlighter, monaco);
    useSettings.getState().onSettingChange("theme", theme);
  } catch (e) {
    toast(`Failed to change theme to ${theme}: ${e instanceof Error ? e.message : e}`);
  } finally {
    useEditorLoading.setState({ loading: undefined });
  }
}
