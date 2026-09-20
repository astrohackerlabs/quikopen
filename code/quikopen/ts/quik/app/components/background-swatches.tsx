export type StageBg = "dark" | "bright" | "checkered";

const MODES: { id: StageBg; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "bright", label: "Bright" },
  { id: "checkered", label: "Checkered" },
];

export function BackgroundSwatches({
  value,
  onChange,
}: {
  value: StageBg;
  onChange: (next: StageBg) => void;
}): React.JSX.Element {
  return (
    <div
      data-testid="quik-bg"
      className="quik-bg"
      role="group"
      aria-label="Stage background"
    >
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          data-testid={`quik-bg-${mode.id}`}
          data-bg={mode.id}
          className="quik-bg-swatch"
          aria-label={mode.label}
          aria-pressed={value === mode.id}
          title={mode.label}
          onClick={() => {
            onChange(mode.id);
          }}
        />
      ))}
    </div>
  );
}
