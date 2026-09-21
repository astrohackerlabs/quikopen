import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  resolveImagePath,
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  imageDisposition,
} from "./image-path.ts";

const fixture = path.resolve(import.meta.dir, "../../fixtures/sample.svg");

describe("resolveImagePath", () => {
  test("formats, case, names, size boundary and resolved symlink policy", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quik-images-"));
    try {
      for (const [extension, mime] of Object.entries(IMAGE_TYPES)) {
        const name = ` 雪 quoted "image"${extension.toUpperCase()}`;
        const file = path.join(dir, name);
        fs.writeFileSync(file, new Uint8Array(IMAGE_MAX_BYTES));
        const result = resolveImagePath(file);
        expect(result).toEqual({
          ok: true,
          path: fs.realpathSync(file),
          name,
          size: IMAGE_MAX_BYTES,
          mime,
        });
        fs.appendFileSync(file, "x");
        expect(resolveImagePath(file)).toEqual({
          ok: false,
          error: `image too large (${String(IMAGE_MAX_BYTES + 1)} bytes; max ${String(IMAGE_MAX_BYTES)})`,
        });
      }
      const target = path.join(dir, "target.png");
      fs.writeFileSync(target, "not decodable: browser must report failure");
      const link = path.join(dir, "alias.txt");
      fs.symlinkSync(target, link);
      expect(resolveImagePath(link)).toMatchObject({
        ok: true,
        name: "target.png",
        mime: "image/png",
      });
      fs.unlinkSync(target);
      expect(resolveImagePath(link).ok).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("filename headers encode Unicode, quotes and control characters", () => {
    const name = '雪 "x"\r\n.gif';
    const header = imageDisposition(name);
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(header.split("UTF-8''")[1] ?? "")).toBe(name);
  });
  test("accepts the checked-in fixture", () => {
    const r = resolveImagePath(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe("sample.svg");
    expect(r.path).toBe(fs.realpathSync(fixture));
    expect(r.size).toBeGreaterThan(0);
    expect(r.size).toBeLessThanOrEqual(IMAGE_MAX_BYTES);
  });

  test("rejects missing files", () => {
    const r = resolveImagePath(
      path.join(os.tmpdir(), "quik-missing-no-such.svg"),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("file not found");
  });

  test("rejects unsupported suffix", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quik-image-"));
    const png = path.join(dir, "nope.txt");
    fs.writeFileSync(png, "png");
    const r = resolveImagePath(png);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("unsupported image type");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("rejects directories", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quik-image-dir-"));
    const named = path.join(dir, "folder.svg");
    fs.mkdirSync(named);
    const r = resolveImagePath(named);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("not a file");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("rejects empty input", () => {
    const r = resolveImagePath("  ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("missing image path");
  });
});
