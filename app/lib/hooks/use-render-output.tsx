import { useMemo, useState } from "react";
import RenderDialog from "~/components/RenderDialog";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";

export const useRenderOutput = () => {
  const [state, setState] = useState<{ open: boolean; preview: boolean }>({
    open: false,
    preview: false,
  });

  const Component = useMemo(
    () => (
      <Dialog defaultOpen open={state.open} onOpenChange={(v) => setState((p) => ({ ...p, open: v }))}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="h-[85%] w-[85%] overflow-auto max-w-none! items-start flex flex-col gap-0 p-0 border-none"
        >
          <DialogTitle className="sr-only absolute">Output Render</DialogTitle>
          <RenderDialog preview={state.preview} onClose={() => setState((p) => ({ ...p, open: false }))} />
        </DialogContent>
      </Dialog>
    ),
    [state.preview, state.open]
  );

  const trigger = (preview: boolean = false) => {
    setState((p) => ({ ...p, open: true, preview }));
  };

  return [Component, trigger] as const;
};
