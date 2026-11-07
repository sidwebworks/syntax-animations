import { BlendingModeIcon } from "@radix-ui/react-icons";
import { TextIcon } from "lucide-react";
import { bundledLanguages, bundledThemes, type BundledLanguage, type BundledTheme } from "shiki";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { setLanguage, setTheme } from "~/lib/editor";
import { useSettings } from "~/lib/settings";
import { ComboboxPopover } from "./ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import InputNumber from "./ui/number-field";
import { Switch } from "./ui/switch";

const LANGUAGES = Object.keys(bundledLanguages).map((value) => ({ label: value, value }));
const THEMES = Object.keys(bundledThemes).map((value) => ({ label: value, value }));

function SettingsDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settings = useSettings();
  const set = settings.onSettingChange;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="min-h-[20rem]">
        <Tabs defaultValue="editor">
          <DialogHeader className="flex mb-2">
            <DialogTitle>Settings Panel</DialogTitle>
          </DialogHeader>

          <TabsList className="w-full max-w-none text-foreground h-auto gap-2 rounded-none bg-transparent px-0 py-1">
            <TabsTrigger value="editor">Editor options</TabsTrigger>
            <TabsTrigger value="animation">Animation options</TabsTrigger>
          </TabsList>

          <TabsContent
            value="editor"
            className="flex flex-col w-full content-start place-items-start justify-start py-2 gap-y-3"
          >
            <ComboboxPopover
              label="Theme"
              placeholder="Select a theme"
              items={THEMES}
              value={settings.theme}
              onChange={(v) => v && setTheme(v.value as BundledTheme)}
            >
              <BlendingModeIcon className="size-4" />
            </ComboboxPopover>
            <ComboboxPopover
              label="Language"
              placeholder="Select a language"
              items={LANGUAGES}
              value={settings.language}
              onChange={(v) => v && setLanguage(v.value as BundledLanguage)}
            >
              <TextIcon className="size-4" />
            </ComboboxPopover>
          </TabsContent>
          <TabsContent
            value="animation"
            className="flex flex-col w-full content-start place-items-start justify-start py-2 gap-y-3"
          >
            <InputNumber
              label="Slide interval (seconds)"
              min={0}
              step={0.5}
              value={settings.slideInterval}
              onValueChange={(v) => v !== null && set("slideInterval", v)}
            />
            <InputNumber
              label="Transition (seconds)"
              min={0.1}
              step={0.1}
              value={settings.transition}
              onValueChange={(v) => v !== null && set("transition", v)}
            />
            <InputNumber
              label="Stagger"
              min={0}
              max={1}
              step={0.1}
              value={settings.stagger}
              onValueChange={(v) => v !== null && set("stagger", v)}
            />
            <div className="flex items-center justify-between w-full">
              <Label htmlFor="line-numbers" className="text-muted-foreground text-sm">
                Line numbers
              </Label>
              <Switch
                id="line-numbers"
                checked={settings.lineNumbers}
                onCheckedChange={(v) => set("lineNumbers", v)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
