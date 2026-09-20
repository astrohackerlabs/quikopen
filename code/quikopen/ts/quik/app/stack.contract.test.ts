/**
 * Quik stack contract: React Router 8 + shared @astrohacker/ui.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript/package.json";
import vite from "vite/package.json";

const pkgRoot = join(import.meta.dir, "..");

describe("quik stack contract (RR8 + @astrohacker/ui)", () => {
  test("package.json depends on react-router, react, and @astrohacker/ui", () => {
    const pkg = JSON.parse(
      readFileSync(join(pkgRoot, "package.json"), "utf8"),
    ) as {
      name?: string;
      bin?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(pkg.name).toBe("@astrohacker/quikopen");
    expect(pkg.bin?.quikopen).toBe("./dist/quikopen");
    expect(pkg.dependencies?.["react-router"]).toBeDefined();
    expect(pkg.dependencies?.react).toBeDefined();
    expect(pkg.dependencies?.["@astrohacker/ui"]).toBe("workspace:*");
  });

  test("typescript 7 and vite 8 resolved", () => {
    const pkg = JSON.parse(
      readFileSync(join(pkgRoot, "package.json"), "utf8"),
    ) as { devDependencies?: Record<string, string> };
    expect(pkg.devDependencies?.typescript ?? "").toMatch(/^\^?7(\.|$)/);
    expect(pkg.devDependencies?.vite ?? "").toMatch(/^\^?8(\.|$)/);
    expect(Number(ts.version.split(".")[0])).toBe(7);
    expect(Number(vite.version.split(".")[0])).toBe(8);
  });

  test("uses SpaceRain card shell and RR routes", () => {
    const page = readFileSync(
      join(pkgRoot, "app/components/viewer-page.tsx"),
      "utf8",
    );
    expect(page).toContain('from "@astrohacker/ui/space-rain"');
    expect(page).toContain("quik-space-rain");
    expect(page).toContain("quik-svg");
    expect(page).not.toContain("dangerouslySetInnerHTML");
    const routes = readFileSync(join(pkgRoot, "app/routes.ts"), "utf8");
    expect(routes).toContain("@react-router/dev/routes");
    const entry = readFileSync(join(pkgRoot, "app/entry.server.tsx"), "utf8");
    expect(entry).toContain("renderToReadableStream");
    expect(entry).not.toMatch(/renderToPipeableStream\s*\(/);
  });

  test("one dist/quikopen binary and no Node production runtime", () => {
    const build = readFileSync(
      join(pkgRoot, "scripts/build-quikopen.ts"),
      "utf8",
    );
    expect(build).toContain('"dist/quikopen"');
    expect(build).toContain("--outfile");
    expect(existsSync(join(pkgRoot, "scripts/build-quikopen.ts"))).toBe(true);
    const pkg = readFileSync(join(pkgRoot, "package.json"), "utf8");
    expect(pkg).not.toContain('"node ');
  });

  test("no UDS shared daemon", () => {
    const sources = [
      "cli.ts",
      "app/cli/process-runtime.ts",
      "app/cli/parse-args.ts",
      "app/cli/product-identity.ts",
      "app/cli/paths.ts",
      "AGENTS.md",
    ].map((rel) => readFileSync(join(pkgRoot, rel), "utf8"));
    const joined = sources.join("\n");
    expect(joined).not.toContain("quik.sock");
    expect(joined).not.toContain("QUIK_SOCK_PATH");
    expect(joined).not.toContain("QUIK_ROLE");
    expect(existsSync(join(pkgRoot, "app/cli/spawn-server.ts"))).toBe(false);
    expect(existsSync(join(pkgRoot, "app/cli/control-protocol.ts"))).toBe(
      false,
    );
    expect(existsSync(join(pkgRoot, "app/cli/client-runtime.ts"))).toBe(false);
    expect(existsSync(join(pkgRoot, "app/cli/server-runtime.ts"))).toBe(false);
  });

  test("card uses natural SVG size with min, max, and inner scroll", () => {
    const css = readFileSync(join(pkgRoot, "app/app.css"), "utf8");
    expect(css).toContain("min-width: 20rem");
    expect(css).toContain("min-height: 16rem");
    expect(css).toContain("max-width: calc(100vw - 3rem)");
    expect(css).toContain("max-height: calc(100dvh - 3rem)");
    expect(css).toMatch(/\.quik-stage[\s\S]*overflow:\s*auto/);
    expect(css).toMatch(/html[\s\S]*overflow:\s*hidden/);
    const svgRule = css.slice(css.indexOf(".quik-svg"));
    expect(svgRule).toContain("width: auto");
    expect(svgRule).toContain("height: auto");
    expect(svgRule).toContain("max-width: none");
    expect(svgRule).toContain("max-height: none");
    expect(svgRule).not.toContain("object-fit: contain");
    expect(svgRule).not.toContain("width: 100%");
    const page = readFileSync(
      join(pkgRoot, "app/components/viewer-page.tsx"),
      "utf8",
    );
    expect(page).toContain('data-testid="quik-stage"');
    expect(page).not.toContain("max-w-[640px]");
  });

  test("size fixtures declare explicit pixel width and height", () => {
    const expected: Record<string, { width: string; height: string }> = {
      "sample.svg": { width: "32", height: "32" },
      "medium.svg": { width: "400", height: "400" },
      "wide.svg": { width: "2000", height: "200" },
      "tall.svg": { width: "200", height: "2000" },
      "huge.svg": { width: "2000", height: "2000" },
    };
    for (const [name, size] of Object.entries(expected)) {
      const path = join(pkgRoot, "fixtures", name);
      expect(existsSync(path)).toBe(true);
      const svg = readFileSync(path, "utf8");
      expect(svg).toContain(`width="${size.width}"`);
      expect(svg).toContain(`height="${size.height}"`);
      expect(svg).toContain(`viewBox="0 0 ${size.width} ${size.height}"`);
    }
  });
});
