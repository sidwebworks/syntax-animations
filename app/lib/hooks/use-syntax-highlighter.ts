import { shikiToMonaco } from "@shikijs/monaco";
import "shiki-magic-move/dist/style.css";
import { toast } from "sonner";
import { getTextmateGrammar, getTextmateTheme } from "~/lib/api";
import { EditorStatus, useEditorStore, useSettingsStore, type TSettingsState } from "~/lib/store";
import { withCache } from "~/lib/utils";

export const useSyntaxHighlighter = () => {
  const editor = useEditorStore();
  const { onSettingChange, theme } = useSettingsStore();
  const highlighter = editor.highlighter!;
  const monaco = editor.monaco!;

  const setLanguage = async (value: TSettingsState["language"]) => {
    try {
      const data = await withCache(`textmate_lang_${value}`, async () => {
        editor.setStatus(EditorStatus.LoadingGrammar);
        const grammar = await getTextmateGrammar(value);
        editor.setStatus(EditorStatus.Idle);
        return grammar;
      });
      highlighter.loadLanguageSync(data);
      monaco.languages.register({ id: value });
      shikiToMonaco(highlighter, monaco);
      monaco.editor.getModels().map((m) => monaco.editor.setModelLanguage(m, value));
      monaco.editor.setTheme(theme);
      onSettingChange("language", value);
    } catch (error: any) {
      toast(`Failed to change language - ${value}`);
    }
  };

  const setTheme = async (value: TSettingsState["theme"]) => {
    try {
      const data = await withCache(`textmate_theme_${value}`, async () => {
        editor.setStatus(EditorStatus.LoadingTheme);
        const theme = await getTextmateTheme(value);
        editor.setStatus(EditorStatus.Idle);
        return theme;
      });
      highlighter.loadThemeSync(data);
      shikiToMonaco(highlighter, monaco);
      onSettingChange("theme", value);
    } catch (error: any) {
      toast(`Failed to change theme - ${value}`);
    }
  };

  return { setLanguage, setTheme };
};
