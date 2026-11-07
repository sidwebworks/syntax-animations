import { GitHubLogoIcon, LayersIcon, ViewVerticalIcon } from "@radix-ui/react-icons";
import { DownloadIcon, PlayIcon, Settings } from "lucide-react";
import { Link } from "react-router";
import { useEditorLoading } from "~/lib/editor";
import { useSettings } from "~/lib/settings";
import { saveSlides, useSaving, useSlides } from "~/lib/slides";
import type { Output } from "./OutputDialog";
import { Button } from "./ui/button";
import { Toggle } from "./ui/toggle";

function ToolBar(props: { output?: Output; onOutput: (output: Output) => void; onSettings: () => void }) {
  const loading = useEditorLoading((s) => s.loading);
  const saving = useSaving((s) => s.saving);
  const { enablePreviewPanel, enableSlidesPanel, onSettingChange } = useSettings();
  const frame = useSlides((s) => s.order.indexOf(s.active) + 1);

  return (
    <nav className="flex w-full justify-between items-center px-2 py-1.5 gap-2 h-12">
      <Button variant={"ghost"} size="icon" asChild>
        <Link target="_blank" rel="noreferrer noopener" to="https://github.com/sidwebworks/syntax-animations">
          <GitHubLogoIcon className="text-muted-foreground" />
        </Link>
      </Button>

      <div className="text-sm [&>*:nth-child(1)]:border-r-0 [&>*:nth-child(1)]:rounded-r-none [&>*:last-child]:border-l-0 [&>*:last-child]:rounded-l-none text-center mx-auto max-w-max justify-center absolute text-muted-foreground inset-x-0 flex items-center">
        <Toggle
          variant={"outline"}
          pressed={enableSlidesPanel}
          onPressedChange={(v) => onSettingChange("enableSlidesPanel", v)}
        >
          <LayersIcon className="size-4" />
        </Toggle>
        <Button
          variant={"outline"}
          onClick={saveSlides}
          className={
            "text-xs justify-between flex rounded-none border text-nowrap items-center gap-x-2 px-4 py-1.5 max-w-full"
          }
        >
          {props.output
            ? "animating"
            : loading
              ? `loading ${loading}`
              : saving
                ? "saving project"
                : `Frame ${frame}`}
          <span className="flex size-2.5 relative">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 opacity-75"></span>
            <span className="relative inline-flex size-2.5 rounded-full bg-primary"></span>
          </span>
        </Button>
        <Toggle
          variant={"outline"}
          pressed={enablePreviewPanel}
          onPressedChange={(v) => onSettingChange("enablePreviewPanel", v)}
        >
          <ViewVerticalIcon className="size-4" />
        </Toggle>
      </div>

      <div className="flex ml-auto items-center [&>button]:rounded-none [&>button:last-child]:rounded-r-md [&>button:nth-child(1)]:rounded-l-md [&>*:not(:first-child)]:border-l-0">
        <Button variant={"outline"} size="icon" onClick={() => props.onOutput("play")} aria-label="Play">
          <PlayIcon className="fill-current text-emerald-400" />
        </Button>
        <Button variant={"outline"} className="text-xs" onClick={() => props.onOutput("export")} aria-label="Export video">
          <DownloadIcon className="text-primary" />
        </Button>
        <Button
          variant={"outline"}
          size="icon"
          onClick={props.onSettings}
          aria-label="Settings"
        >
          <Settings className="text-muted-foreground" />
        </Button>
      </div>
    </nav>
  );
}

export default ToolBar;
