import { clampTo, LIMITS, useSettings } from "~/lib/settings";
import { setSlideOptions, useFrameNumber, useSlides } from "~/lib/slides";

const input =
  "h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-ring";

/** Options for the open slide. */
function SlideOptionsBar() {
  const active = useSlides((s) => s.active);
  const frame = useFrameNumber();
  const options = useSlides((s) => s.options[s.active]);
  const slideInterval = useSettings((s) => s.slideInterval);

  return (
    <div className="flex h-10 shrink-0 items-center gap-4 border-b px-3 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Frame {frame}</span>
      <label className="flex items-center gap-2">
        Focus lines
        <input
          key={`focus-${active}`}
          className={`${input} w-28`}
          placeholder="e.g. 3-5, 8"
          defaultValue={options?.focus ?? ""}
          onChange={(e) => setSlideOptions(active, { focus: e.currentTarget.value || undefined })}
        />
      </label>
      <label className="flex items-center gap-2">
        Hold
        <input
          key={`hold-${active}`}
          type="number"
          min={LIMITS.hold.min}
          max={LIMITS.hold.max}
          step={0.5}
          className={`${input} w-20`}
          placeholder={`${slideInterval}s`}
          defaultValue={options?.hold ?? ""}
          onChange={(e) => {
            const hold = e.currentTarget.valueAsNumber;
            setSlideOptions(active, { hold: Number.isFinite(hold) ? clampTo(LIMITS.hold, hold) : undefined });
          }}
        />
        seconds
      </label>
    </div>
  );
}

export default SlideOptionsBar;
