import { describe, expect, test } from "bun:test";

import {
  isBunCompileVirtualEntry,
  overlayFromOptions,
  parseClientArgs,
} from "./parse-args.ts";
import { setOverlayDefaults } from "./termsurf-encode.ts";

const COMPILED_ARGV0 = "/opt/homebrew/bin/quikopen";
const BUNFS_ENTRY = "/$bunfs/root/quikopen";
const SVG = "/tmp/demo.svg";

describe("isBunCompileVirtualEntry", () => {
  test("matches Bun virtual entry forms", () => {
    expect(isBunCompileVirtualEntry("/$bunfs/root/quikopen")).toBe(true);
    expect(isBunCompileVirtualEntry("/$bunfs/root/cli.ts")).toBe(true);
  });

  test("does not match ordinary user tokens", () => {
    expect(isBunCompileVirtualEntry("quikopen")).toBe(false);
    expect(isBunCompileVirtualEntry("/usr/local/bin/quikopen")).toBe(false);
    expect(isBunCompileVirtualEntry("--browser")).toBe(false);
    expect(isBunCompileVirtualEntry("file.svg")).toBe(false);
  });
});

describe("parseClientArgs", () => {
  test("only exact source argv[1] is skipped", () => {
    const entry = "/source with spaces/cli.ts";
    expect(
      parseClientArgs(["bun", entry, SVG, "--profile", "lab"], entry),
    ).toEqual({
      ok: true,
      options: { file: SVG, browser: "", profile: "lab" },
    });
    for (const args of [
      ["bun", entry, "--bad"],
      ["bun", entry, "--browser"],
      ["quik", "unrelated.ts", "two"],
    ]) {
      expect(parseClientArgs(args, entry).ok).toBe(false);
    }
    expect(parseClientArgs(["bun", entry, SVG], entry).ok).toBe(true);
  });

  test("requires a positional image path", () => {
    const r = parseClientArgs(["quik"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing image path");
  });

  test("skips Bun compile virtual entry then reads the path", () => {
    const r = parseClientArgs([COMPILED_ARGV0, BUNFS_ENTRY, SVG]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.file).toBe(SVG);
    expect(r.options.browser).toBe("");
    expect(r.options.profile).toBe("default");
  });

  test("parses flags after Bun virtual entry", () => {
    const r = parseClientArgs([
      COMPILED_ARGV0,
      BUNFS_ENTRY,
      "--browser",
      "webkit",
      "--profile",
      "work",
      SVG,
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.file).toBe(SVG);
    expect(r.options.browser).toBe("webkit");
    expect(r.options.profile).toBe("work");
  });

  test("parses equals flags after Bun virtual entry", () => {
    const r = parseClientArgs([
      COMPILED_ARGV0,
      BUNFS_ENTRY,
      "--browser=chromium",
      "--profile=lab",
      SVG,
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("chromium");
    expect(r.options.profile).toBe("lab");
  });

  test("parses short flags after Bun virtual entry", () => {
    const r = parseClientArgs([
      COMPILED_ARGV0,
      BUNFS_ENTRY,
      "-b",
      "chromium",
      "-p",
      "incognito",
      SVG,
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("chromium");
    expect(r.options.profile).toBe("incognito");
  });

  test("still rejects unknown flags after Bun virtual entry", () => {
    const r = parseClientArgs([
      COMPILED_ARGV0,
      BUNFS_ENTRY,
      "--incognito",
      SVG,
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("unknown option");
  });

  test("rejects a second positional after the image path", () => {
    const r = parseClientArgs([COMPILED_ARGV0, BUNFS_ENTRY, SVG, "extra-arg"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("unexpected argument: extra-arg");
  });

  test("parses --browser and --profile with a path", () => {
    const r = parseClientArgs([
      "quik",
      "--browser",
      "webkit",
      "--profile",
      "work",
      SVG,
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.file).toBe(SVG);
    expect(r.options.browser).toBe("webkit");
    expect(r.options.profile).toBe("work");
  });

  test("parses short -b and -p", () => {
    const r = parseClientArgs([
      "quik",
      "-b",
      "chromium",
      "-p",
      "incognito",
      SVG,
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("chromium");
    expect(r.options.profile).toBe("incognito");
  });

  test("parses --browser=value form", () => {
    const r = parseClientArgs([
      "quik",
      "--browser=webkit",
      "--profile=p1",
      SVG,
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.browser).toBe("webkit");
    expect(r.options.profile).toBe("p1");
  });

  test("rejects --server as an unknown option", () => {
    const r = parseClientArgs(["quik", "--server", SVG]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("unknown option: --server");
  });

  test("errors on missing --browser value", () => {
    const r = parseClientArgs(["quik", "--browser"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("missing value");
  });

  test("errors on unknown flag", () => {
    const r = parseClientArgs(["quik", "--incognito", SVG]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("unknown option");
  });
});

describe("overlayFromOptions + setOverlayDefaults (real encode path)", () => {
  test("omit path keeps host defaults on SetOverlay fields", () => {
    const r = parseClientArgs(["quik", SVG]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = overlayFromOptions(r.options);
    const f = setOverlayDefaults({
      paneId: "p",
      col: 0,
      row: 0,
      width: 80,
      height: 24,
      url: "http://127.0.0.1:1/",
      browser: o.browser,
      profile: o.profile,
    });
    expect(f.browser).toBe("");
    expect(f.profile).toBe("default");
  });

  test("flags appear on real SetOverlay fields", () => {
    const r = parseClientArgs([
      "quik",
      "--browser",
      "webkit",
      "--profile",
      "lab",
      SVG,
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = overlayFromOptions(r.options);
    const f = setOverlayDefaults({
      paneId: "p",
      col: 0,
      row: 0,
      width: 80,
      height: 24,
      url: "http://127.0.0.1:1/",
      browser: o.browser,
      profile: o.profile,
    });
    expect(f.browser).toBe("webkit");
    expect(f.profile).toBe("lab");
  });
});
