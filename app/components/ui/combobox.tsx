import * as React from "react";

import { Button } from "~/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "~/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

export type ComboboxItem = {
  value: string;
  label: string;
};

type Props = {
  items: ComboboxItem[];
  label?: string;
  placeholder?: string;
  value?: string;
  onChange: (value: ComboboxItem | null) => void;
};

export function ComboboxPopover(props: React.PropsWithChildren<Props>) {
  const [open, setOpen] = React.useState(false);
  const selected = props.items.find((item) => item.value === props.value);

  return (
    <div className="flex items-center justify-between space-x-4 w-full">
      {props.label && <p className="text-muted-foreground text-sm">{props.label}</p>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size={props.value ? "default" : "icon"}
            className="text-accent-foreground font-light"
          >
            {selected ? selected.label : props.children}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" side="bottom" align="end">
          <Command>
            <CommandInput placeholder={props.placeholder} />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {props.items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    className={cn(item.value === selected?.value && "bg-muted")}
                    onSelect={(value) => {
                      props.onChange(props.items.find((el) => el.value === value) || null);
                      setOpen(false);
                    }}
                  >
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
