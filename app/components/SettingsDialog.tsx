import { BlendingModeIcon } from "@radix-ui/react-icons";
import { TextIcon } from "lucide-react";
import type { ReactNode } from "react";
import { bundledLanguages, bundledThemes, type BundledLanguage, type BundledTheme } from "shiki";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { setLanguage, setTheme } from "~/lib/editor";
import { openProjectFile, projectFile, shareLink } from "~/lib/project";
import { ASPECTS, BACKGROUNDS, LIMITS, useSettings } from "~/lib/settings";
import { download } from "~/lib/utils";
import { ComboboxPopover } from "./ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import InputNumber from "./ui/number-field";
import { Segmented } from "./ui/segmented";
import { Switch } from "./ui/switch";

const LANGUAGES = Object.keys(bundledLanguages).map((value) => ({ label: value, value }));
const THEMES = Object.keys(bundledThemes).map((value) => ({ label: value, value }));
const ASPECT_OPTIONS = Object.keys(ASPECTS).map((key) => [key, key === "auto" ? "Fit" : key] as const) as readonly (readonly [
  keyof typeof ASPECTS,
  string,
])[];

const tab = "flex flex-col w-full content-start place-items-start justify-start py-2 gap-y-3";
const button =
  "rounded-md border px-3 py-1.5 text-sm transition-[transform,background-color] duration-150 hover:bg-muted active:scale-[0.97]";

function SettingsDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settings = useSettings();
  const set = settings.onSettingChange;

  async function copyShareLink() {
    try {
      // The link is passed as a promise so Safari still sees the click that started the copy.
      const link = shareLink().then((text) => new Blob([text], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": link })]);
      toast("Share link copied");
    } catch (e) {
      toast(`Couldn't make a share link: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      await openProjectFile(file);
      toast(`Opened ${file.name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="min-h-[24rem]">
        <Tabs defaultValue="editor">
          <DialogHeader className="flex mb-2">
            <DialogTitle>Settings Panel</DialogTitle>
          </DialogHeader>

          <TabsList className="w-full max-w-none text-foreground h-auto gap-2 rounded-none bg-transparent px-0 py-1">
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="animation">Animation</TabsTrigger>
            <TabsTrigger value="frame">Frame</TabsTrigger>
            <TabsTrigger value="project">Project</TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className={tab}>
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

          <TabsContent value="animation" className={tab}>
            <InputNumber
              label="Slide interval (seconds)"
              min={LIMITS.slideInterval.min}
              max={LIMITS.slideInterval.max}
              step={0.5}
              value={settings.slideInterval}
              onValueChange={(v) => v !== null && set("slideInterval", v)}
            />
            <InputNumber
              label="Transition (seconds)"
              min={LIMITS.transition.min}
              max={LIMITS.transition.max}
              step={0.1}
              value={settings.transition}
              onValueChange={(v) => v !== null && set("transition", v)}
            />
            <InputNumber
              label="Stagger"
              min={LIMITS.stagger.min}
              max={LIMITS.stagger.max}
              step={0.1}
              value={settings.stagger}
              onValueChange={(v) => v !== null && set("stagger", v)}
            />
            <Row label="Line numbers" htmlFor="line-numbers">
              <Switch id="line-numbers" checked={settings.lineNumbers} onCheckedChange={(v) => set("lineNumbers", v)} />
            </Row>
            <Row label="Type new code" htmlFor="typing">
              <Switch id="typing" checked={settings.typing} onCheckedChange={(v) => set("typing", v)} />
            </Row>
          </TabsContent>

          <TabsContent value="frame" className={tab}>
            <Row label="Aspect ratio">
              <Segmented label="Aspect ratio" value={settings.aspect} options={ASPECT_OPTIONS} onChange={(v) => set("aspect", v)} />
            </Row>
            <Row label="Background">
              <div role="radiogroup" aria-label="Background" className="flex gap-1.5">
                {(Object.keys(BACKGROUNDS) as (keyof typeof BACKGROUNDS)[]).map((name) => {
                  const stops: string[] = BACKGROUNDS[name];
                  return (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={settings.background === name}
                      aria-label={name}
                      title={name}
                      onClick={() => set("background", name)}
                      className="size-6 rounded-full border-2 border-transparent transition-transform duration-150 active:scale-[0.94] aria-checked:border-foreground"
                      style={{
                        background: stops.length ? `linear-gradient(135deg, ${stops.join(", ")})` : "var(--muted)",
                      }}
                    />
                  );
                })}
              </div>
            </Row>
            <InputNumber
              label="Padding (pixels)"
              min={LIMITS.padding.min}
              max={LIMITS.padding.max}
              step={8}
              value={settings.padding}
              onValueChange={(v) => v !== null && set("padding", v)}
            />
            <Row label="Window title bar" htmlFor="window-chrome">
              <Switch id="window-chrome" checked={settings.windowChrome} onCheckedChange={(v) => set("windowChrome", v)} />
            </Row>
            <Row label="Title" htmlFor="title">
              <input
                id="title"
                disabled={!settings.windowChrome}
                value={settings.title}
                placeholder="index.ts"
                onChange={(e) => set("title", e.currentTarget.value)}
                className="h-8 w-44 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
            </Row>
          </TabsContent>

          <TabsContent value="project" className={tab}>
            <p className="text-sm text-muted-foreground">
              A project file or link holds your slides and the animation and frame settings.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={() => download(projectFile(), "syntax-animation.json")}>
                Download project
              </button>
              <label className={`${button} cursor-pointer`}>
                Open project…
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(e) => {
                    importFile(e.currentTarget.files?.[0]);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <button type="button" className={button} onClick={copyShareLink}>
                Copy share link
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between w-full gap-4">
      <Label htmlFor={htmlFor} className="text-muted-foreground text-sm">
        {label}
      </Label>
      {children}
    </div>
  );
}

export default SettingsDialog;
