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

  setupTypeScript(monaco);
}

function setupTypeScript(monaco: Monaco) {
  const { typescriptDefaults, javascriptDefaults } = monaco.languages.typescript;
  for (const defaults of [typescriptDefaults, javascriptDefaults]) {
    defaults.setCompilerOptions({
      allowNonTsExtensions: true,
      target: 99, // ESNext
      module: 99, // ESNext
      // Bundler (missing from Monaco's enum), so package.json "exports" (effect/Schema etc.) resolve
      moduleResolution: 100 as never,
      jsx: 4, // ReactJSX
      strict: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    });
  }

  // Off by default: slides are snippets, so type errors on half-written code are usually noise.
  const showTypeErrors = (on: boolean) => {
    for (const defaults of [typescriptDefaults, javascriptDefaults]) defaults.setDiagnosticsOptions({ noSemanticValidation: !on });
  };
  showTypeErrors(useSettings.getState().typeErrors);
  useSettings.subscribe((s, prev) => s.typeErrors !== prev.typeErrors && showTypeErrors(s.typeErrors));

  // Fetch .d.ts files for whatever the slides import (from jsDelivr) and hand them to Monaco.
  // ATA only needs ts.preProcessFile, so TypeScript loads lazily, the first time a TS/JS slide changes.
  let acquire: Promise<(code: string) => Promise<void>> | undefined;
  const fetchTypes = (code: string) =>
    (acquire ??= Promise.all([import("@typescript/ata"), import("typescript")]).then(([{ setupTypeAcquisition }, ts]) =>
      setupTypeAcquisition({
        projectName: "syntax-animations",
        typescript: ts.default ?? ts,
        delegate: {
          receivedFile(code, path) {
            typescriptDefaults.addExtraLib(code, `file://${path}`);
            javascriptDefaults.addExtraLib(code, `file://${path}`);
          },
          errorMessage: (message, error) => console.warn(`[types] ${message}`, error),
        },
      }),
    )).then((ata) => ata(code));

  const isScript = (model: { getLanguageId(): string }) => ["typescript", "javascript"].includes(model.getLanguageId());
  monaco.editor.onDidCreateModel((model) => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => isScript(model) && fetchTypes(model.getValue()), 500);
    };
    check();
    model.onDidChangeContent(check);
    model.onDidChangeLanguage(check);
  });
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
