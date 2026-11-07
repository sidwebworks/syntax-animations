export function Segmented<T extends string | number>(props: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex items-center rounded-md border p-0.5">
      {props.options.map(([value, text]) => (
        <button
          key={String(value)}
          type="button"
          role="radio"
          aria-checked={props.value === value}
          onClick={() => props.onChange(value)}
          className="rounded px-2.5 py-1 text-xs text-muted-foreground transition-colors aria-checked:bg-muted aria-checked:text-foreground"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
