import { ToggleGroup, ToggleGroupItem } from "@astrohacker/ui/toggle-group";

export type ViewMode = "grid" | "single";

function GridIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="quik-icon">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1" />
    </svg>
  );
}

function SingleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="quik-icon">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    </svg>
  );
}

const MODES: { id: ViewMode; label: string; icon: React.JSX.Element }[] = [
  { id: "grid", label: "Grid", icon: <GridIcon /> },
  { id: "single", label: "Single", icon: <SingleIcon /> },
];

/** Grid (default) or one image at a time with a switcher. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}): React.JSX.Element {
  return (
    <ToggleGroup
      type="single"
      // Left/Right switch images in Single view; keep them out of the group.
      rovingFocus={false}
      value={value}
      onValueChange={(next) => {
        // Radix clears the value when the pressed item is clicked again.
        if (next === "grid" || next === "single") onChange(next);
      }}
      data-testid="quik-view"
      className="quik-segmented"
      aria-label="View"
    >
      {MODES.map((mode) => (
        <ToggleGroupItem
          key={mode.id}
          value={mode.id}
          data-testid={`quik-view-${mode.id}`}
          className="quik-segment"
          aria-label={`${mode.label} view`}
          title={`${mode.label} view`}
        >
          {mode.icon}
          <span className="quik-segment-label">{mode.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
