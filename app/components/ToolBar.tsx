import { BlendingModeIcon, LayersIcon, TextIcon, VideoIcon, ViewVerticalIcon } from "@radix-ui/react-icons";
import { bundledLanguages, bundledThemes, type BundledLanguage, type BundledTheme } from "shiki";
import { useSyntaxHighlighter } from "~/lib/hooks";
import { useEditorStore, useSettingsStore, useTimelineStore, type TSettingsState } from "~/lib/store";
import { Button } from "./ui/button";
import { ComboboxPopover } from "./ui/combobox";
import { Toggle } from "./ui/toggle";
import { memo } from "react";
import { Code, EyeIcon, FileCodeIcon, PlayIcon, ScanEyeIcon, Settings } from "lucide-react";
import { APP_TEXT_MAPPING } from "~/lib/utils";

function ToolBar() {
  const { status } = useEditorStore();
  const { enablePreviewPanel, enableSlidesPanel, language, theme, onSettingChange } = useSettingsStore();
  const { setLanguage, setTheme } = useSyntaxHighlighter();
  const { active, order } = useTimelineStore();

  const index = order.findIndex((el) => el === active) + 1;

  return (
    <nav className="flex w-full justify-evenly px-2 py-1.5 gap-2 h-12">
      <span
        className={
          "uppercase text-xs justify-between flex border text-nowrap items-center gap-x-2 px-4 py-1 rounded-full max-w-max"
        }
      >
        {APP_TEXT_MAPPING.status[status]}
        <span className="flex size-2.5 relative">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex size-2.5 rounded-full bg-green-500"></span>
        </span>
      </span>

      <div className="text-sm text-center mx-auto max-w-max justify-center gap-x-2 absolute text-muted-foreground inset-x-0 pt-2 flex items-center">
        Frame {index} <FileCodeIcon className="size-4" />
      </div>

      <div className="flex ml-auto gap-2 items-center">
        <Button variant={"outline"} size="icon" onClick={() => onSettingChange("enableSettingsDialog", true)}>
          <Settings className="text-muted-foreground" />
        </Button>
        <Toggle
          variant={"outline"}
          pressed={enablePreviewPanel}
          onPressedChange={(v) => onSettingChange("enablePreviewPanel", v)}
        >
          <ViewVerticalIcon className="size-4" />
        </Toggle>
        <Toggle
          variant={"outline"}
          pressed={enableSlidesPanel}
          onPressedChange={(v) => onSettingChange("enableSlidesPanel", v)}
        >
          <LayersIcon className="size-4" />
        </Toggle>
        <Button variant={"outline"} size="icon" onClick={() => onSettingChange("enableRenderPanel", true)}>
          <PlayIcon className="fill-current text-cyan-400" />
        </Button>
      </div>
    </nav>
  );
}

export default memo(ToolBar);
