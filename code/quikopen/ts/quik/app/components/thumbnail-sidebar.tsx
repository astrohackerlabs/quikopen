import { useEffect, useRef } from "react";
import type { StageBg } from "~/components/background-swatches";
import type { NaturalSize } from "~/components/image-frame";

export interface Thumbnail {
  name: string;
  src: string;
  failed: boolean;
}

/**
 * Thumbnails view selector: one numbered preview per image. Previews always
 * fit their tile and follow the background, but never the zoom.
 */
export function ThumbnailSidebar({
  images,
  index,
  bg,
  onSelect,
  onNatural,
  onFailed,
}: {
  images: Thumbnail[];
  index: number;
  bg: StageBg;
  onSelect: (next: number) => void;
  onNatural: (index: number, size: NaturalSize) => void;
  onFailed: (index: number, failed: boolean) => void;
}): React.JSX.Element {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>(
      "[aria-current=true]",
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [index]);

  return (
    <nav aria-label="Images" data-testid="quik-thumbs" className="quik-thumbs">
      <ol ref={listRef} className="quik-thumb-list">
        {images.map((image, i) => (
          <li key={String(i)}>
            <button
              type="button"
              data-testid="quik-thumb"
              data-index={i}
              className="quik-thumb"
              aria-current={i === index ? "true" : undefined}
              aria-label={`${String(i + 1)}. ${image.name}`}
              title={image.name}
              onClick={() => {
                onSelect(i);
              }}
            >
              <span
                data-testid="quik-thumb-tile"
                className="quik-thumb-tile quik-frame"
                data-bg={bg}
              >
                {image.failed ? (
                  <span
                    data-testid="quik-thumb-error"
                    className="quik-thumb-error"
                    aria-hidden="true"
                  >
                    !
                  </span>
                ) : (
                  <img
                    data-testid="quik-thumb-image"
                    className="quik-thumb-image"
                    key={image.src}
                    src={image.src}
                    alt=""
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    onError={() => {
                      onFailed(i, true);
                    }}
                    onLoad={(event) => {
                      onNatural(i, {
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                    }}
                  />
                )}
              </span>
              <span className="quik-thumb-caption" aria-hidden="true">
                <span className="quik-caption-number">{i + 1}</span>
                <span
                  data-testid="quik-thumb-name"
                  className="quik-caption-name quik-thumb-name"
                >
                  {image.name}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
