import type { StageBg } from "~/components/background-swatches";
import { ZOOM_FIT, zoomSize, type Zoom } from "~/lib/image-zoom";

export interface NaturalSize {
  width: number;
  height: number;
}

/**
 * One image on its background. Fit shrinks it into the frame without
 * enlarging; a percentage paints it from its natural size and scrolls.
 */
export function ImageFrame({
  src,
  name,
  bg,
  zoom,
  failed,
  natural,
  onNatural,
  onFailed,
  testId,
  imageTestId,
}: {
  src: string;
  name: string;
  bg: StageBg;
  zoom: Zoom;
  failed: boolean;
  natural: NaturalSize | null;
  onNatural: (size: NaturalSize) => void;
  onFailed: (failed: boolean) => void;
  testId: string;
  imageTestId: string;
}): React.JSX.Element {
  const fit = zoom === ZOOM_FIT;
  return (
    <div
      data-testid={testId}
      className="quik-frame"
      data-bg={bg}
      data-fit={fit ? "true" : "false"}
    >
      {failed ? (
        <p role="alert" data-testid="quik-image-error" className="quik-error">
          Could not display {name}. The file may be damaged, unsupported, or no
          longer available.
        </p>
      ) : null}
      <img
        data-testid={imageTestId}
        className="quik-image"
        key={src}
        src={src}
        hidden={failed}
        style={
          fit || natural === null
            ? undefined
            : {
                width: zoomSize(natural.width, zoom),
                height: zoomSize(natural.height, zoom),
              }
        }
        onError={() => {
          onFailed(true);
        }}
        onLoad={(event) => {
          onNatural({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          });
          onFailed(false);
        }}
        alt={name}
      />
    </div>
  );
}
