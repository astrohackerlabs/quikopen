import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { SpaceRain } from "@astrohacker/ui/space-rain";
import { shellPanel } from "@astrohacker/ui/surfaces";
import { cn } from "~/lib/utils";
import { ExitButton } from "~/components/exit-button";
import {
  BackgroundSwatches,
  type StageBg,
} from "~/components/background-swatches";
import {
  applyRevision,
  imageUrlWithRevision,
  REVISION_POLL_MS,
  type RevisionActionData,
} from "~/lib/image-revision";

export function ViewerPage(): React.JSX.Element {
  const [name, setName] = useState("");
  const [imageSrc, setImageSrc] = useState("");
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [bg, setBg] = useState<StageBg>("dark");
  const fetcher = useFetcher<RevisionActionData>();
  const fetcherRef = useRef(fetcher);
  const appliedRef = useRef<number | null>(null);
  const imageSrcRef = useRef("");
  const sawSuccess = useRef(false);
  const timerRef = useRef<number | null>(null);
  fetcherRef.current = fetcher;
  imageSrcRef.current = imageSrc;

  useEffect(() => {
    const page = new URL(window.location.href);
    const fromQuery = page.searchParams.get("name");
    if (fromQuery) setName(fromQuery);
    const q = page.search;
    const initial = `/image${q}`;
    imageSrcRef.current = initial;
    setImageSrc(initial);
    const token = page.searchParams.get("token") ?? "";
    void fetch(`/__quik/meta${q}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; name?: string }>)
      .then((body) => {
        if (body.ok && body.name) setName(body.name);
      })
      .catch(() => {
        /* Vite dev has no process meta */
      });

    const submit = (): void => {
      if (timerRef.current === null) return;
      const current = fetcherRef.current;
      if (current.state !== "idle") return;
      const seen = appliedRef.current;
      void current.submit(
        { token, seen: seen === null ? "" : String(seen) },
        { method: "post", action: "/?index" },
      );
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
    const decision = applyRevision(appliedRef.current, data);
    appliedRef.current = decision.applied;
    if (!decision.changed || decision.applied === null) return;
    if (decision.showError) {
      setFailedSrc(imageSrcRef.current);
      return;
    }
    setFailedSrc(null);
    const next = imageUrlWithRevision(window.location.search, decision.applied);
    imageSrcRef.current = next;
    setImageSrc(next);
  }, [fetcher.data]);

  return (
    <div data-testid="quik" className="quik-root relative min-h-dvh">
      <SpaceRain data-testid="quik-space-rain" />
      <div
        aria-hidden="true"
        className="bg-[rgba(17, 18, 25,0.55)] pointer-events-none fixed inset-0 z-[2]"
      />
      <main className="relative z-10 flex min-h-dvh items-center justify-center">
        <section
          data-testid="quik-shell"
          className={cn("quik-shell p-5", shellPanel)}
        >
          <header
            data-testid="quik-header"
            className="mb-[18px] flex shrink-0 flex-col gap-2"
          >
            <div
              data-testid="quik-header-chrome"
              className="flex items-center gap-3"
            >
              <img
                src="/images/quikopen-dark-64.webp"
                srcSet="/images/quikopen-dark-64.webp 1x, /images/quikopen-dark-128.webp 2x, /images/quikopen-dark-200.webp 3x"
                width={40}
                height={40}
                alt="QuikOpen logo"
                data-testid="quik-logo"
              />
              <p className="m-0 min-w-0 flex-1 font-heading text-[0.85rem] font-bold tracking-[0.28em] text-primary">
                QuikOpen
              </p>
              <BackgroundSwatches value={bg} onChange={setBg} />
              <ExitButton />
            </div>
            <p
              className="m-0 w-full truncate text-[0.75rem] tracking-[0.08em] text-muted"
              data-testid="quik-filename"
            >
              {name || "Image"}
            </p>
          </header>
          <div data-testid="quik-stage" className="quik-stage" data-bg={bg}>
            {failedSrc === imageSrc ? (
              <p
                role="alert"
                data-testid="quik-image-error"
                className="p-6 text-primary"
              >
                Could not display {name || "this image"}. The file may be
                damaged, unsupported, or no longer available.
              </p>
            ) : null}
            {imageSrc ? (
              <img
                data-testid="quik-image"
                className="quik-image"
                key={imageSrc}
                src={imageSrc}
                hidden={failedSrc === imageSrc}
                onError={() => {
                  setFailedSrc(imageSrc);
                }}
                onLoad={() => {
                  setFailedSrc(null);
                }}
                alt={name || "Image"}
              />
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
