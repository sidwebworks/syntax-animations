import { CodeEditor } from "~/components/CodeEditor";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { setup, useSettingsStore, useTimelineStore } from "~/lib/store";
import type { Route } from "./+types/index";

import PreviewRender from "~/components/PreviewRender";
import SlidesPanel from "~/components/SlidesPanel";
import ToolBar from "~/components/ToolBar";
import { useBeforeUnload, useBlocker } from "react-router";
import { useInterval } from "@mantine/hooks";
import SettingsDialog from "~/components/SettingsDialog";
import RenderDialog from "~/components/RenderDialog";
import { MobileUnsupportedDialog } from "~/components/MobileSupport";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New React Router App" }, { name: "description", content: "Welcome to React Router!" }];
}

export async function clientLoader() {
  await setup();
}

export default function Home() {
  const { enablePreviewPanel, enableRenderPanel } = useSettingsStore();
  const save = useTimelineStore((s) => s.save);

  useInterval(() => save(), 10000, { autoInvoke: true });
  useBeforeUnload(() => save());

  return (
    <div className="h-full flex flex-col">
      <MobileUnsupportedDialog />
      <ToolBar />
      <SettingsDialog />
      <ResizablePanelGroup direction="horizontal" className="">
        <ResizablePanel defaultSize={50}>
          <CodeEditor />
        </ResizablePanel>
        <ResizableHandle withHandle />
        {enablePreviewPanel && (
          <ResizablePanel defaultSize={50} minSize={20}>
            <PreviewRender />
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
      {enableRenderPanel && <RenderDialog />}
      <SlidesPanel />
    </div>
  );
}
