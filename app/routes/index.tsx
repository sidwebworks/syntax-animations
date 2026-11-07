import { Loader } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CodeEditor } from "~/components/CodeEditor";
import { DeviceSupportDialog } from "~/components/DeviceSupport";
import { OutputDialog, type Output } from "~/components/OutputDialog";
import PreviewSlide from "~/components/PreviewSlide";
import SettingsDialog from "~/components/SettingsDialog";
import SlideOptionsBar from "~/components/SlideOptionsBar";
import SlidesPanel from "~/components/SlidesPanel";
import ToolBar from "~/components/ToolBar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { setupEditor } from "~/lib/editor";
import { isSupported } from "~/lib/engine";
import { hasProjectLink, openProject, projectFromLink } from "~/lib/project";
import { useSettings } from "~/lib/settings";
import { loadSlides } from "~/lib/slides";
import type { Route } from "./+types/index";

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

let ready: Promise<void> | undefined;

async function setup() {
  await setupEditor();
  await loadSlides();

  if (!hasProjectLink()) return;
  const shared = await projectFromLink();
  history.replaceState(null, "", location.pathname + location.search);
  if (!shared) toast("That share link is broken or from a newer version");
  else if (confirm("Open the shared project? It replaces the slides you have now.")) await openProject(shared);
}

export async function clientLoader() {
  const supported = isSupported();
  if (supported) await (ready ??= setup());
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
  const enablePreviewPanel = useSettings((s) => s.enablePreviewPanel);
  const [output, setOutput] = useState<Output>();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!loaderData.supported) return <DeviceSupportDialog supported={false} />;

  return (
    <div className="h-full flex flex-col">
      <DeviceSupportDialog supported />
      <ToolBar output={output} onOutput={setOutput} onSettings={() => setSettingsOpen(true)} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50} className="flex flex-col">
          <SlideOptionsBar />
          <div className="min-h-0 flex-1">
            <CodeEditor />
          </div>
        </ResizablePanel>
        {enablePreviewPanel && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={20}>
              <PreviewSlide />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      <SlidesPanel />
      <OutputDialog output={output} onClose={() => setOutput(undefined)} />
    </div>
  );
}
