import { GitHubLogoIcon, LayersIcon, ViewVerticalIcon } from "@radix-ui/react-icons";
import { FileCodeIcon, PlayIcon, SaveIcon, Settings } from "lucide-react";
import { memo } from "react";
import { useEditorStore, useSettingsStore, useTimelineStore } from "~/lib/store";
import { APP_TEXT_MAPPING } from "~/lib/utils";
import { Button } from "./ui/button";
import { Toggle } from "./ui/toggle";
import { Link } from "react-router";

function ToolBar(props: { onSave: () => void }) {
  const { status } = useEditorStore();
  const { enablePreviewPanel, enableSlidesPanel, onSettingChange } = useSettingsStore();
  const { active, order } = useTimelineStore();

  const index = order.findIndex((el) => el === active) + 1;

  return (
    <nav className="flex w-full justify-evenly px-2 py-1.5 gap-2 h-12">
      <Button variant={"ghost"} size="icon" asChild>
        <Link target="_blank" rel="norefferer noopener" to="https://github.com/sidwebworks/syntax-animations">
          <GitHubLogoIcon className="text-muted-foreground" />
        </Link>
      </Button>
      <span
        className={
          "text-xs justify-between flex border text-nowrap items-center gap-x-2 px-4 py-1 rounded-full max-w-max"
        }
      >
        {APP_TEXT_MAPPING.status[status]}
        <span className="flex size-2.5 relative">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 opacity-75"></span>
          <span className="relative inline-flex size-2.5 rounded-full bg-primary"></span>
        </span>
      </span>

      <div className="text-sm text-center mx-auto max-w-max justify-center gap-x-2 absolute text-muted-foreground inset-x-0 pt-2 flex items-center">
        Frame {index} <FileCodeIcon className="size-4" />
      </div>

      <div className="flex ml-auto items-center [&>button]:rounded-none [&>button:last-child]:rounded-r-md [&>button:nth-child(1)]:rounded-l-md [&>*:nth-child(n+2):nth-child(-n+5)]:border-l-0">
        <Button variant={"outline"} size="icon" onClick={props.onSave}>
          <SaveIcon className="text-muted-foreground" />
        </Button>
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
          <PlayIcon className="fill-current text-primary" />
        </Button>
      </div>
    </nav>
  );
}

export default memo(ToolBar);
