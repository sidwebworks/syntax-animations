import { CodeEditor } from "~/components/CodeEditor";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { EditorStatus, setup, useEditorStore, useSettingsStore, useTimelineStore } from "~/lib/store";
import type { Route } from "./+types/index";

import { useInterval } from "@mantine/hooks";
import { Loader } from "lucide-react";
import { useBeforeUnload } from "react-router";
import { DeviceSupportDialog } from "~/components/DeviceSupport";
import PreviewSlide from "~/components/PreviewSlide";
import SettingsDialog from "~/components/SettingsDialog";
import SlidesPanel from "~/components/SlidesPanel";
import ToolBar from "~/components/ToolBar";
import { getRequiredBrowserFeatures } from "~/lib/utils";
import { useRenderOutput } from "~/lib/hooks/use-render-output";

export function meta({}: Route.MetaArgs) {
  const title = "Syntax Animations";
  const description = "Easily animate code snippets and save them as videos.";
  const url = "https://syntax.rathi.sh";
  const image = "https://syntax.rathi.sh/og_preview.png";

  return [
    { title },
    { name: "description", content: description },

    // Open Graph
    { property: "og:url", content: url },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image },

    // Twitter
    { name: "twitter:card", content: "summary_large_image" },
    { property: "twitter:domain", content: "syntax.rathi.sh" },
    { property: "twitter:url", content: url },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}

export async function clientLoader() {
  const features = getRequiredBrowserFeatures();

  const supported = features.every((r) => {
    const type = typeof r[0];
    return type === r[1];
  });

  if (supported) await setup();

  return { supported };
}

export function HydrateFallback() {
  return (
    <div className="grid w-full h-full place-content-center">
      <Loader className="animate-spin" />
    </div>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { enablePreviewPanel, enableRenderPanel } = useSettingsStore();
  const [RenderOutput, trigger] = useRenderOutput();
  const save = useTimelineStore((s) => s.save);
  const setStatus = useEditorStore((s) => s.setStatus);

  const onSave = async () => {
    if (!loaderData.supported) return;
    setStatus(EditorStatus.Saving);
    await save();
    setStatus(EditorStatus.Idle);
  };

  useInterval(() => onSave(), 5000, { autoInvoke: true });
  useBeforeUnload(() => onSave());

  return (
    <div className="h-full flex flex-col">
      <DeviceSupportDialog supported={loaderData.supported} />
      <ToolBar onSave={onSave} onPlay={trigger} />
      <SettingsDialog />
      {loaderData.supported && (
        <ResizablePanelGroup direction="horizontal" className="">
          <ResizablePanel defaultSize={50}>
            <CodeEditor />
          </ResizablePanel>
          <ResizableHandle withHandle />
          {enablePreviewPanel && (
            <ResizablePanel defaultSize={50} minSize={20}>
              <PreviewSlide />
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      )}
      <SlidesPanel />
      {RenderOutput}
    </div>
  );
}
