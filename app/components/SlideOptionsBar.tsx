import { NumberField } from "@base-ui-components/react/number-field";
import { Crosshair, RotateCcw, TextSelect, Timer } from "lucide-react";
import { editor } from "~/lib/editor";
import { LIMITS, useSettings } from "~/lib/settings";
import { parseLineRanges, setSlideOptions, useFrameNumber, useSlides } from "~/lib/slides";
import { cn } from "~/lib/utils";
import { CursorGrowIcon } from "./ui/number-field";

// Ghost field: invisible until hovered, tinted while focused, so the bar reads as a toolbar rather than a form.
const field =
  "flex h-7 items-center gap-1.5 rounded-md px-2 transition-colors duration-150 ease-out hover:bg-muted/50 focus-within:bg-muted/70 focus-within:ring-1 focus-within:ring-ring";
const input = "bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50";
const iconButton =
  "grid size-5 place-items-center rounded text-muted-foreground transition-[color,background-color,opacity,scale] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.94]";

/** "3-5, 8" from the editor's selections (multi-cursor gives several ranges). */
function selectedLines() {
  const selections = editor().monaco.editor.getEditors()[0]?.getSelections() ?? [];
  return selections
    .map(({ startLineNumber: a, endLineNumber: b, endColumn }) => {
      // A selection that ends at the start of a line doesn't include that line.
      if (b > a && endColumn === 1) b--;
      return a === b ? `${a}` : `${a}-${b}`;
    })
    .join(", ");
}

/** Options for the open slide. */
function SlideOptionsBar() {
  const active = useSlides((s) => s.active);
  const total = useSlides((s) => s.order.length);
  const frame = useFrameNumber();
  const options = useSlides((s) => s.options[s.active]);
  const slideInterval = useSettings((s) => s.slideInterval);

  const focus = options?.focus ?? "";
  const focusInvalid = focus.trim() !== "" && parseLineRanges(focus).length === 0;
  const hold = options?.hold ?? null;

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b px-3 text-xs text-muted-foreground">
      <span className="mr-2 font-medium text-foreground tabular-nums">
        Frame {frame}
        <span className="text-muted-foreground/60"> / {total}</span>
      </span>
      <span aria-hidden className="mr-1 h-4 w-px bg-border" />

      <label
        className={cn(field, focusInvalid && "ring-1 ring-destructive")}
        title={focusInvalid ? "Use line numbers like 3-5, 8" : "Highlight these lines and dim the rest"}
      >
        <Crosshair className="size-3.5 shrink-0" aria-hidden />
        Focus
        <input
          className={cn(input, "w-20", focusInvalid && "text-destructive")}
          placeholder="3-5, 8"
          aria-invalid={focusInvalid}
          value={focus}
          onChange={(e) => setSlideOptions(active, { focus: e.currentTarget.value || undefined })}
        />
        <button
          type="button"
          className={iconButton}
          title="Use the lines selected in the editor"
          aria-label="Use the lines selected in the editor"
          onClick={() => setSlideOptions(active, { focus: selectedLines() || undefined })}
        >
          <TextSelect className="size-3.5" />
        </button>
      </label>

      <NumberField.Root
        className={field}
        min={LIMITS.hold.min}
        max={LIMITS.hold.max}
        step={0.5}
        value={hold}
        onValueChange={(v) => setSlideOptions(active, { hold: v ?? undefined })}
        title={hold === null ? `Uses the slide interval (${slideInterval}s). Type or drag to override.` : "Seconds this frame stays on screen"}
      >
        {/* Drag the label sideways to scrub the value, like in Figma. */}
        <NumberField.ScrubArea className="flex cursor-ew-resize select-none items-center gap-1.5">
          <Timer className="size-3.5 shrink-0" aria-hidden />
          Hold
          <NumberField.ScrubAreaCursor className="drop-shadow-sm">
            <CursorGrowIcon />
          </NumberField.ScrubAreaCursor>
        </NumberField.ScrubArea>
        <NumberField.Input
          aria-label="Hold seconds"
          className={cn(input, "w-7 text-right tabular-nums")}
          placeholder={String(slideInterval)}
        />
        <span className={hold === null ? "text-muted-foreground/50" : "text-foreground"}>s</span>
        <button
          type="button"
          tabIndex={hold === null ? -1 : 0}
          aria-hidden={hold === null}
          className={cn(iconButton, hold === null && "pointer-events-none scale-90 opacity-0")}
          title="Back to the slide interval"
          aria-label="Reset hold to the slide interval"
          onClick={() => setSlideOptions(active, { hold: undefined })}
        >
          <RotateCcw className="size-3" />
        </button>
      </NumberField.Root>
    </div>
  );
}

export default SlideOptionsBar;
