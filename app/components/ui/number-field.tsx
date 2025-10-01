import * as React from "react";
import { NumberField } from "@base-ui-components/react/number-field";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Label } from "./label";

export default function InputNumber({
  label,
  ...props
}: React.ComponentProps<typeof NumberField.Root> & { label: string }) {
  const id = React.useId();
  return (
    <div className="flex items-center justify-between space-x-4 w-full">
      <p className="text-muted-foreground text-sm">
        <Label htmlFor={id} className="cursor-ew-resize">
          {label}
        </Label>
      </p>
      <NumberField.Root id={id} className="flex flex-col items-start gap-1" {...props}>
        <NumberField.ScrubArea className="cursor-ew-resize">
          <NumberField.ScrubAreaCursor className="drop-shadow-sm">
            <CursorGrowIcon />
          </NumberField.ScrubAreaCursor>
        </NumberField.ScrubArea>

        <NumberField.Group className="flex">
          <NumberField.Decrement className="flex h-8 w-8 items-center justify-center rounded-l-md border border-input bg-muted text-foreground hover:bg-muted/80 active:bg-muted/70">
            <MinusIcon className="h-4 w-4" />
          </NumberField.Decrement>

          <NumberField.Input className="h-8 w-20 border-t border-b border-input bg-background text-center text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-offset-2" />

          <NumberField.Increment className="flex h-8 w-8 items-center justify-center rounded-r-md border border-input bg-muted text-foreground hover:bg-muted/80 active:bg-muted/70">
            <PlusIcon className="h-4 w-4" />
          </NumberField.Increment>
        </NumberField.Group>
      </NumberField.Root>
    </div>
  );
}

function CursorGrowIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      width="26"
      height="14"
      viewBox="0 0 24 14"
      fill="black"
      stroke="white"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M19.5 5.5L6.49737 5.51844V2L1 6.9999L6.5 12L6.49737 8.5L19.5 8.5V12L25 6.9999L19.5 2V5.5Z" />
    </svg>
  );
}
