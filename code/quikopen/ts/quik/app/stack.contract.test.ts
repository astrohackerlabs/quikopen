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

  test("simplified viewer without SpaceRain, on RR routes", () => {
    const page = readFileSync(
      join(pkgRoot, "app/components/viewer-page.tsx"),
      "utf8",
    );
    expect(page).not.toContain("space-rain");
    expect(page).not.toContain("SpaceRain");
    expect(page).not.toContain("motion-mode");
    expect(page).toContain("quik-image");
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

  test("frames fit without enlarging and scroll when zoomed", () => {
    const css = readFileSync(join(pkgRoot, "app/app.css"), "utf8");
    expect(css).toMatch(/\.quik-frame \{[^}]*overflow:\s*auto/);
    expect(css).toMatch(/html[\s\S]*overflow:\s*hidden/);
    const imageRule = css.slice(css.indexOf(".quik-image {"));
    expect(imageRule).toContain("width: auto");
    expect(imageRule).toContain("max-width: none");
    const fitRule = css.slice(
      css.indexOf('.quik-frame[data-fit="true"] .quik-image'),
    );
    expect(fitRule).toContain("max-width: 100%");
    expect(fitRule).toContain("max-height: 100%");
    expect(fitRule).not.toMatch(/\n\s*width: 100%/);
    const frame = readFileSync(
      join(pkgRoot, "app/components/image-frame.tsx"),
      "utf8",
    );
    expect(frame).toContain("data-fit=");
    const page = readFileSync(
      join(pkgRoot, "app/components/viewer-page.tsx"),
      "utf8",
    );
    expect(page).toContain('"quik-stage"');
    expect(page).toContain('"quik-cell-frame"');
  });

  test("three frame background swatches", () => {
    const css = readFileSync(join(pkgRoot, "app/app.css"), "utf8");
    expect(css).toContain('.quik-frame[data-bg="dark"]');
    expect(css).toContain('.quik-frame[data-bg="bright"]');
    expect(css).toContain('.quik-frame[data-bg="checkered"]');
    expect(css).toContain("repeating-conic-gradient");
    const swatches = readFileSync(
      join(pkgRoot, "app/components/background-swatches.tsx"),
      "utf8",
    );
    expect(swatches).toContain('data-testid="quik-bg"');
    expect(swatches).toContain("Dark");
    expect(swatches).toContain("Bright");
    expect(swatches).toContain("Checkered");
    const page = readFileSync(
      join(pkgRoot, "app/components/viewer-page.tsx"),
      "utf8",
    );
    expect(page).toContain("BackgroundSwatches");
    const frame = readFileSync(
      join(pkgRoot, "app/components/image-frame.tsx"),
      "utf8",
    );
    expect(frame).toContain("data-bg={bg}");
  });

  test("card uses the quikopen mark not Astrohacker 7", () => {
    const page = readFileSync(
      join(pkgRoot, "app/components/viewer-page.tsx"),
      "utf8",
    );
    expect(page).toContain("/images/quikopen-dark-64.webp");
    expect(page).toContain("QuikOpen logo");
    expect(page).not.toContain("Quikopen logo");
    expect(page).not.toContain("astrohacker-7");
    expect(
      existsSync(join(pkgRoot, "public/images/quikopen-dark-64.webp")),
    ).toBe(true);
    expect(
      existsSync(join(pkgRoot, "public/images/quikopen-dark-128.webp")),
    ).toBe(true);
    expect(
      existsSync(join(pkgRoot, "public/images/quikopen-dark-200.webp")),
    ).toBe(true);
    // The monorepo master assets/quikopen.svg is outside this package and
    // the public source. scripts/verify-brand-logo-factory.nu pins it.
  });

  test("one toolbar holds brand, view, background, zoom and Exit", () => {
    const page = readFileSync(
      join(pkgRoot, "app/components/viewer-page.tsx"),
      "utf8",
    );
    const start = page.indexOf('data-testid="quik-toolbar"');
    const end = page.indexOf("</header>", start);
    expect(start).toBeGreaterThan(0);
    const toolbar = page.slice(start, end);
    for (const part of [
      "quik-logo",
      "quik-filename",
      "ViewToggle",
      "BackgroundSwatches",
      "ZoomControl",
      "ExitButton",
    ]) {
      expect(toolbar).toContain(part);
    }
    expect(page).toContain("ImageSwitcher");
    expect(page).toContain("gridShape");
    const switcher = readFileSync(
      join(pkgRoot, "app/components/image-switcher.tsx"),
      "utf8",
    );
    // TermSurf panes do not host OS-native popups: use the kit Select.
    expect(switcher).toContain('from "@astrohacker/ui/select"');
    expect(switcher).not.toContain("<select");
    expect(
      existsSync(
        join(
          pkgRoot,
          "fixtures/a-very-long-quikopen-filename-that-needs-the-full-card-row.svg",
        ),
      ),
    ).toBe(true);
  });

  test("size fixtures declare explicit pixel width and height", () => {
    const expected: Record<string, { width: string; height: string }> = {
      "sample.svg": { width: "32", height: "32" },
      "medium.svg": { width: "400", height: "400" },
      "wide.svg": { width: "2000", height: "200" },
      "tall.svg": { width: "200", height: "2000" },
      "huge.svg": { width: "2000", height: "2000" },
      "transparent-black.svg": { width: "200", height: "200" },
      "a-very-long-quikopen-filename-that-needs-the-full-card-row.svg": {
        width: "32",
        height: "32",
      },
    };
    for (const [name, size] of Object.entries(expected)) {
      const path = join(pkgRoot, "fixtures", name);
      expect(existsSync(path)).toBe(true);
      const svg = readFileSync(path, "utf8");
      expect(svg).toContain(`width="${size.width}"`);
      expect(svg).toContain(`height="${size.height}"`);
      expect(svg).toContain(`viewBox="0 0 ${size.width} ${size.height}"`);
    }
    const ink = readFileSync(
      join(pkgRoot, "fixtures/transparent-black.svg"),
      "utf8",
    );
    expect(ink).toContain('fill="#000000"');
    expect(ink).not.toContain('fill="#111219"');
  });
});
