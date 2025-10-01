import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { useSettingsStore, type TSettingsState } from "~/lib/store";
import { ComboboxPopover } from "./ui/combobox";
import { bundledLanguages, bundledThemes, type BundledLanguage, type BundledTheme } from "shiki";
import { useSyntaxHighlighter } from "~/lib/hooks";
import { BlendingModeIcon } from "@radix-ui/react-icons";
import { TextIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import InputNumber from "./ui/number-field";

const LANGUAGES = Object.keys(bundledLanguages).map((el) => ({
  label: el,
  value: el,
}));

const THEMES = Object.keys(bundledThemes).map((el) => ({
  label: el,
  value: el,
}));

const EASINGS = [{}];

function SettingsDialog() {
  const { enableSettingsDialog, onSettingChange, language, theme, moveOptions } = useSettingsStore();
  const { setLanguage, setTheme } = useSyntaxHighlighter();

  const onLanguageChange = async (language: TSettingsState["language"]) => {
    await setLanguage(language);
    onSettingChange("language", language);
  };

  const onThemeChange = async (theme: TSettingsState["theme"]) => {
    await setTheme(theme);
    onSettingChange("theme", theme);
  };

  const onMoveOptionChange = <S extends TSettingsState["moveOptions"], K extends keyof S>(name: K, value: S[K]) => {
    useSettingsStore.setState((prev) => ({
      ...prev,
      moveOptions: {
        ...prev.moveOptions,
        [name]: value,
      },
    }));
  };

  return (
    <Dialog
      open={enableSettingsDialog}
      defaultOpen={enableSettingsDialog}
      onOpenChange={(v) => onSettingChange("enableSettingsDialog", v)}
    >
      <DialogContent className="min-h-[20rem]">
        <Tabs defaultValue="tab-1">
          <DialogHeader className="flex mb-2">
            <DialogTitle>Settings Panel</DialogTitle>
          </DialogHeader>

          <TabsList className="w-full max-w-none text-foreground h-auto gap-2 rounded-none bg-transparent px-0 py-1">
            <TabsTrigger value="tab-1">Editor options</TabsTrigger>
            <TabsTrigger value="tab-2">Animation options</TabsTrigger>
          </TabsList>

          <TabsContent
            value="tab-1"
            className="flex flex-col w-full content-start place-items-start justify-start py-2 gap-y-3"
          >
            <ComboboxPopover
              label="Theme"
              placeholder="Select a theme"
              items={THEMES}
              value={theme}
              onChange={(v) => onThemeChange(v?.value as BundledTheme)}
            >
              <BlendingModeIcon className="size-4" />
            </ComboboxPopover>
            <ComboboxPopover
              label="Language"
              placeholder="Select a language"
              items={LANGUAGES}
              value={language}
              onChange={(v) => onLanguageChange(v?.value as BundledLanguage)}
            >
              <TextIcon className="size-4" />
            </ComboboxPopover>
          </TabsContent>
          <TabsContent
            value="tab-2"
            className="flex flex-col w-full content-start place-items-start justify-start py-2 gap-y-3"
          >
            <InputNumber
              label="Slide interval (Seconds)"
              value={moveOptions.slideInterval / 1000}
              onValueChange={(v) => onMoveOptionChange("slideInterval", v! * 1000)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
