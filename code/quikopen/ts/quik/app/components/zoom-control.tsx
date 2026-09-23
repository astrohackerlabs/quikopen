import { Button } from "@astrohacker/ui/button";
import { ButtonGroup } from "@astrohacker/ui/button-group";

import { nextZoom, zoomEdges, zoomLabel } from "~/lib/image-zoom";

const controlClass = "h-7 min-h-7 px-2 py-0 text-xs tracking-normal";

export function ZoomControl({
  percent,
  onChange,
}: {
  percent: number;
  onChange: (next: number) => void;
}): React.JSX.Element {
  const edges = zoomEdges(percent);
  return (
    <div data-testid="quik-zoom" className="quik-zoom">
      <ButtonGroup aria-label="Zoom">
        <Button
          type="button"
          variant="ghost"
          className={controlClass}
          aria-label="Zoom out"
          disabled={edges.minus}
          onClick={() => {
            onChange(nextZoom(percent, -1));
          }}
        >
          −
        </Button>
        <span
          data-testid="quik-zoom-percent"
          className="quik-zoom-percent font-mono text-xs text-primary"
        >
          {zoomLabel(percent)}
        </span>
        <Button
          type="button"
          variant="ghost"
          className={controlClass}
          aria-label="Zoom in"
          disabled={edges.plus}
          onClick={() => {
            onChange(nextZoom(percent, 1));
          }}
        >
          +
        </Button>
      </ButtonGroup>
    </div>
  );
}
