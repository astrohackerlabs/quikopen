import { useEffect, useState } from "react";
import { SpaceRain } from "@astrohacker/ui/space-rain";
import { shellPanel } from "@astrohacker/ui/surfaces";
import { cn } from "~/lib/utils";
import { ExitButton } from "~/components/exit-button";
import {
  BackgroundSwatches,
  type StageBg,
} from "~/components/background-swatches";

export function ViewerPage(): React.JSX.Element {
  const [name, setName] = useState("");
  const [svgSrc, setSvgSrc] = useState("");
  const [bg, setBg] = useState<StageBg>("dark");

  useEffect(() => {
    const page = new URL(window.location.href);
    const fromQuery = page.searchParams.get("name");
    if (fromQuery) setName(fromQuery);
    const q = page.search;
    setSvgSrc(`/svg${q}`);
    void fetch(`/__quik/meta${q}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; name?: string }>)
      .then((body) => {
        if (body.ok && body.name) setName(body.name);
      })
      .catch(() => {
        /* Vite dev has no process meta */
      });
  }, []);

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
                src="/images/astrohacker-7-dark-64.webp"
                srcSet="/images/astrohacker-7-dark-64.webp 1x, /images/astrohacker-7-dark-128.webp 2x, /images/astrohacker-7-dark-200.webp 3x"
                width={40}
                height={40}
                alt="Astrohacker logo"
                data-testid="quik-logo"
              />
              <p className="m-0 min-w-0 flex-1 font-heading text-[0.85rem] font-bold tracking-[0.28em] text-primary uppercase">
                Quikopen
              </p>
              <BackgroundSwatches value={bg} onChange={setBg} />
              <ExitButton />
            </div>
            <p
              className="m-0 w-full truncate text-[0.75rem] tracking-[0.08em] text-muted"
              data-testid="quik-filename"
            >
              {name || "SVG"}
            </p>
          </header>
          <div data-testid="quik-stage" className="quik-stage" data-bg={bg}>
            {svgSrc ? (
              <img
                data-testid="quik-svg"
                className="quik-svg"
                src={svgSrc}
                alt={name || "SVG"}
              />
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
