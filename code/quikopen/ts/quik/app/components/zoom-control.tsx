import { Button } from "@astrohacker/ui/button";

import {
  nextZoom,
  zoomEdges,
  zoomLabel,
  ZOOM_FIT,
  type Zoom,
} from "~/lib/image-zoom";

/** − / percentage / +. The percentage reads Fit by default; click it to refit. */
export function ZoomControl({
  zoom,
  onChange,
}: {
  zoom: Zoom;
  onChange: (next: Zoom) => void;
}): React.JSX.Element {
  const edges = zoomEdges(zoom);
  return (
    <div
      data-testid="quik-zoom"
      className="quik-segmented"
      role="group"
      aria-label="Zoom"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        typography="ui"
        className="quik-segment quik-segment-icon"
        aria-label="Zoom out"
        disabled={edges.minus}
        onClick={() => {
          onChange(nextZoom(zoom, -1));
        }}
      >
        −
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        typography="ui"
        data-testid="quik-zoom-fit"
        className="quik-segment quik-zoom-fit"
        aria-label="Fit images to their frames"
        aria-pressed={zoom === ZOOM_FIT}
        title="Fit images to their frames"
        onClick={() => {
          onChange(ZOOM_FIT);
        }}
      >
        <span data-testid="quik-zoom-percent" className="quik-zoom-percent">
          {zoomLabel(zoom)}
        </span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        typography="ui"
        className="quik-segment quik-segment-icon"
        aria-label="Zoom in"
        disabled={edges.plus}
        onClick={() => {
          onChange(nextZoom(zoom, 1));
        }}
      >
        +
      </Button>
    </div>
  );
}
