import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { ExitButton } from "~/components/exit-button";
import {
  BackgroundSwatches,
  type StageBg,
} from "~/components/background-swatches";
import { ImageFrame, type NaturalSize } from "~/components/image-frame";
import { ImageSwitcher } from "~/components/image-switcher";
import { ThumbnailSidebar } from "~/components/thumbnail-sidebar";
import { ViewToggle } from "~/components/view-toggle";
import { ZoomControl } from "~/components/zoom-control";
import { gridShape } from "~/lib/image-grid";
import { keyDelta, step, type ViewMode } from "~/lib/image-nav";
import {
  applyRevision,
  imageUrl,
  REVISION_POLL_MS,
  type RevisionActionData,
} from "~/lib/image-revision";
import { ZOOM_DEFAULT, type Zoom } from "~/lib/image-zoom";

interface ImageState {
  name: string;
  src: string;
  /** The src that failed to decode or became unavailable. */
  failedSrc: string | null;
  natural: NaturalSize | null;
}

export function ViewerPage(): React.JSX.Element {
  const [images, setImages] = useState<ImageState[] | null>(null);
  const [view, setView] = useState<ViewMode>("thumbs");
  const [current, setCurrent] = useState(0);
  const [bg, setBg] = useState<StageBg>("dark");
  const [zoom, setZoom] = useState<Zoom>(ZOOM_DEFAULT);
  const fetcher = useFetcher<RevisionActionData>();
  const fetcherRef = useRef(fetcher);
  const appliedRef = useRef<(number | null)[]>([]);
  const navRef = useRef<number | null>(null);
  const viewRef = useRef(view);
  const sawSuccess = useRef(false);
  const timerRef = useRef<number | null>(null);
  fetcherRef.current = fetcher;
  viewRef.current = view;

  const count = images?.length ?? 0;
  const single = view !== "grid" || count === 1;
  const thumbs = view === "thumbs" && count > 1;

  const update = useCallback(
    (index: number, patch: Partial<ImageState>): void => {
      setImages((prev) =>
        prev === null
          ? prev
          : prev.map((image, i) =>
              i === index ? { ...image, ...patch } : image,
            ),
      );
    },
    [],
  );

  useEffect(() => {
    const page = new URL(window.location.href);
    const search = page.search;
    const token = page.searchParams.get("token") ?? "";
    const named = page.searchParams.get("name");
    const fallback = named !== null && named !== "" ? named : "Image";
    const adopt = (names: string[]): void => {
      appliedRef.current = names.map(() => null);
      setImages(
        names.map((name, i) => ({
          name,
          src: imageUrl(search, i),
          failedSrc: null,
          natural: null,
        })),
      );
    };
    void fetch(`/__quik/meta${search}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; images?: unknown }>)
      .then((body) => {
        const names = Array.isArray(body.images)
          ? body.images.map((entry: unknown) => {
              const name = (entry as { name?: unknown } | null)?.name;
              return typeof name === "string" && name ? name : fallback;
            })
          : [];
        adopt(body.ok && names.length > 0 ? names : [fallback]);
      })
      .catch(() => {
        // Vite dev has no process meta: show the one image named in the URL.
        adopt([fallback]);
      });

    const submit = (): void => {
      if (timerRef.current === null) return;
      const live = fetcherRef.current;
      if (live.state !== "idle") return;
      void live.submit({ token }, { method: "post", action: "/?index" });
    };
    timerRef.current = window.setInterval(submit, REVISION_POLL_MS);
    submit();
    return (): void => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (!data.ok) {
      if (!sawSuccess.current && timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    sawSuccess.current = true;
    if (images === null) return;

    // Terminal arrows reach the process on the PTY; apply new steps here.
    navRef.current ??= data.nav;
    const steps = data.nav - navRef.current;
    navRef.current = data.nav;
    if (steps !== 0 && viewRef.current !== "grid" && images.length > 1) {
      setCurrent((index) => step(index, steps, images.length));
    }

    const search = window.location.search;
    data.revisions.slice(0, images.length).forEach((snapshot, i) => {
      const decision = applyRevision(appliedRef.current[i] ?? null, {
        ok: true,
        ...snapshot,
      });
      appliedRef.current[i] = decision.applied;
      if (!decision.changed || decision.applied === null) return;
      if (decision.showError) {
        setImages((prev) =>
          prev === null
            ? prev
            : prev.map((image, j) =>
                j === i ? { ...image, failedSrc: image.src } : image,
              ),
        );
        return;
      }
      update(i, {
        src: imageUrl(search, i, decision.applied),
        failedSrc: null,
        natural: null,
      });
    });
  }, [fetcher.data, images, update]);

  useEffect(() => {
    if (count < 2) return;
    const onKey = (event: KeyboardEvent): void => {
      const delta = keyDelta(event.key, viewRef.current);
      if (delta === null) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role=combobox], [role=listbox], input, select")) {
        return;
      }
      event.preventDefault();
      setCurrent((index) => step(index, delta, count));
    };
    window.addEventListener("keydown", onKey);
    return (): void => {
      window.removeEventListener("keydown", onKey);
    };
  }, [count]);

  const frame = (
    index: number,
    testId: string,
    imageTestId: string,
  ): React.JSX.Element | null => {
    const image = images?.[index];
    if (!image) return null;
    return (
      <ImageFrame
        src={image.src}
        name={image.name}
        bg={bg}
        zoom={zoom}
        failed={image.failedSrc === image.src}
        natural={image.natural}
        onNatural={(natural) => {
          update(index, { natural });
        }}
        onFailed={(failed) => {
          update(index, { failedSrc: failed ? image.src : null });
        }}
        testId={testId}
        imageTestId={imageTestId}
      />
    );
  };

  const shape = gridShape(count);
  const selected = images?.[current];

  return (
    <div data-testid="quik" className="quik-root" data-view={view}>
      <header data-testid="quik-toolbar" className="quik-toolbar">
        <div className="quik-brand">
          <img
            src="/images/quikopen-dark-64.webp"
            srcSet="/images/quikopen-dark-64.webp 1x, /images/quikopen-dark-128.webp 2x, /images/quikopen-dark-200.webp 3x"
            width={24}
            height={24}
            alt="QuikOpen logo"
            data-testid="quik-logo"
          />
          <span className="quik-wordmark font-heading">QuikOpen</span>
        </div>
        <div className="quik-title">
          {count === 1 && selected ? (
            <span data-testid="quik-filename" className="quik-filename">
              {selected.name}
            </span>
          ) : count > 1 ? (
            <span data-testid="quik-count" className="quik-count">
              {count} images
            </span>
          ) : null}
        </div>
        {count > 1 ? <ViewToggle value={view} onChange={setView} /> : null}
        <BackgroundSwatches value={bg} onChange={setBg} />
        <ZoomControl zoom={zoom} onChange={setZoom} />
        <ExitButton />
      </header>
      {images !== null && count > 1 && view === "single" ? (
        <div className="quik-subbar">
          <ImageSwitcher
            names={images.map((image) => image.name)}
            index={current}
            onChange={setCurrent}
          />
        </div>
      ) : null}
      <main className="quik-main" data-view={thumbs ? "thumbs" : undefined}>
        {images === null ? null : thumbs ? (
          <>
            <ThumbnailSidebar
              images={images.map((image) => ({
                name: image.name,
                src: image.src,
                failed: image.failedSrc === image.src,
              }))}
              index={current}
              bg={bg}
              onSelect={setCurrent}
              onNatural={(index, natural) => {
                // The stage reports natural size first when it can.
                if (images[index]?.natural === null) update(index, { natural });
              }}
              onFailed={(index, failed) => {
                const src = images[index]?.src ?? null;
                update(index, { failedSrc: failed ? src : null });
              }}
            />
            {frame(current, "quik-stage", "quik-image")}
          </>
        ) : single ? (
          frame(count === 1 ? 0 : current, "quik-stage", "quik-image")
        ) : (
          <div
            data-testid="quik-grid"
            className="quik-grid"
            data-cols={shape.cols}
            data-rows={shape.rows}
            style={{
              gridTemplateColumns: `repeat(${String(shape.cols)}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${String(shape.rows)}, minmax(0, 1fr))`,
            }}
          >
            {images.map((image, i) => (
              <figure
                key={String(i)}
                data-testid="quik-cell"
                data-index={i}
                className="quik-cell"
                title="Double-click to view on its own"
                onDoubleClick={() => {
                  setCurrent(i);
                  setView("single");
                }}
              >
                <figcaption className="quik-caption">
                  <span className="quik-caption-number">{i + 1}</span>
                  <span
                    data-testid="quik-caption"
                    className="quik-caption-name"
                  >
                    {image.name}
                  </span>
                </figcaption>
                {frame(i, "quik-cell-frame", "quik-cell-image")}
              </figure>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
