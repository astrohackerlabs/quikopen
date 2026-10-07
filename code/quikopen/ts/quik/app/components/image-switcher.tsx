import { Button } from "@astrohacker/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@astrohacker/ui/select";

function Chevron({ left }: { left?: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="quik-icon-line">
      <path d={left ? "M10 3 5 8l5 5" : "m6 3 5 5-5 5"} />
    </svg>
  );
}

/** Single-view switcher: previous, the file select box, next, position. */
export function ImageSwitcher({
  names,
  index,
  onChange,
}: {
  names: string[];
  index: number;
  onChange: (next: number) => void;
}): React.JSX.Element {
  const step = (delta: number): void => {
    onChange((index + delta + names.length) % names.length);
  };
  return (
    <div data-testid="quik-switcher" className="quik-switcher">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        typography="ui"
        className="quik-icon-button"
        aria-label="Previous image"
        data-testid="quik-prev"
        onClick={() => {
          step(-1);
        }}
      >
        <Chevron left />
      </Button>
      <Select
        value={String(index)}
        onValueChange={(value) => {
          onChange(Number(value));
        }}
      >
        <SelectTrigger
          aria-label="Image"
          data-testid="quik-select"
          className="quik-select-trigger"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="quik-select-content">
          {names.map((name, i) => (
            <SelectItem
              key={String(i)}
              value={String(i)}
              data-testid={`quik-option-${String(i)}`}
            >
              <span className="quik-option-number">{i + 1}.</span> {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        typography="ui"
        className="quik-icon-button"
        aria-label="Next image"
        data-testid="quik-next"
        onClick={() => {
          step(1);
        }}
      >
        <Chevron />
      </Button>
      <span data-testid="quik-position" className="quik-position">
        {index + 1} / {names.length}
      </span>
    </div>
  );
}
