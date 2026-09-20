import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { resolveSvgPath, SVG_MAX_BYTES } from "./svg-path.ts";

const fixture = path.resolve(import.meta.dir, "../../fixtures/sample.svg");

describe("resolveSvgPath", () => {
  test("accepts the checked-in fixture", () => {
    const r = resolveSvgPath(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe("sample.svg");
    expect(r.path).toBe(fs.realpathSync(fixture));
    expect(r.size).toBeGreaterThan(0);
    expect(r.size).toBeLessThanOrEqual(SVG_MAX_BYTES);
  });

  test("rejects missing files", () => {
    const r = resolveSvgPath(
      path.join(os.tmpdir(), "quik-missing-no-such.svg"),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("file not found");
  });

  test("rejects non-svg suffix", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quik-svg-"));
    const png = path.join(dir, "nope.png");
    fs.writeFileSync(png, "png");
    const r = resolveSvgPath(png);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("not an svg file");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("rejects directories", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quik-svg-dir-"));
    const named = path.join(dir, "folder.svg");
    fs.mkdirSync(named);
    const r = resolveSvgPath(named);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("not a file");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("rejects empty input", () => {
    const r = resolveSvgPath("  ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing svg path");
  });
});
