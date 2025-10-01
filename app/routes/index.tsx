import { CodeEditor } from "~/components/CodeEditor";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { EditorStatus, setup, useEditorStore, useSettingsStore, useTimelineStore } from "~/lib/store";
import type { Route } from "./+types/index";

import PreviewRender from "~/components/PreviewRender";
import SlidesPanel from "~/components/SlidesPanel";
import ToolBar from "~/components/ToolBar";
import { useBeforeUnload, useBlocker } from "react-router";
import { useInterval } from "@mantine/hooks";
import SettingsDialog from "~/components/SettingsDialog";
import RenderDialog from "~/components/RenderDialog";
import { DeviceSupportDialog } from "~/components/DeviceSupport";
import { getRequiredBrowserFeatures } from "~/lib/utils";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Animated Syntax" }, { name: "description", content: "Write and animate your code snippets!" }];
}

export async function clientLoader() {
  const features = getRequiredBrowserFeatures();

  const supported = features.every((r) => {
    const type = typeof r[0];
    return type === r[1];
  });

  await setup();

  return { supported };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { enablePreviewPanel, enableRenderPanel } = useSettingsStore();
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
      <ToolBar onSave={onSave}/>
      <SettingsDialog />
      {loaderData.supported && (
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
      )}
      {enableRenderPanel && <RenderDialog />}
      <SlidesPanel />
    </div>
  );
}
