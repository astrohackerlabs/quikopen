/**
 * Resolve a readable local image. Browser decoding determines image validity.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export const IMAGE_TYPES: Readonly<Record<string, string>> = {
  ".svg": "image/svg+xml; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** RFC 5987 filename: no raw quotes, Unicode or control bytes in the header. */
export function imageDisposition(name: string): string {
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="image"; filename*=UTF-8''${encoded}`;
}

export type ImagePathResult =
  | { ok: true; path: string; name: string; size: number; mime: string }
  | { ok: false; error: string };

export function resolveImagePath(input: string): ImagePathResult {
  const raw = input;
  if (!raw.trim()) return { ok: false, error: "missing image path" };

  let resolved: string;
  try {
    resolved = fs.realpathSync(path.resolve(raw));
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "ENOENT") {
      return { ok: false, error: `file not found: ${raw}` };
    }
    return { ok: false, error: `cannot open ${raw}` };
  }

  let st: fs.Stats;
  try {
    st = fs.statSync(resolved);
  } catch {
    return { ok: false, error: `file not found: ${raw}` };
  }
  if (!st.isFile()) {
    return { ok: false, error: `not a file: ${raw}` };
  }
  const mime = IMAGE_TYPES[path.extname(resolved).toLowerCase()];
  if (!mime) {
    return {
      ok: false,
      error: `unsupported image type: ${raw}; supported: ${Object.keys(IMAGE_TYPES).join(", ")}`,
    };
  }
  if (st.size > IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: `image too large (${String(st.size)} bytes; max ${String(IMAGE_MAX_BYTES)})`,
    };
  }
  try {
    fs.accessSync(resolved, fs.constants.R_OK);
  } catch {
    return { ok: false, error: `unreadable: ${raw}` };
  }
  return {
    ok: true,
    path: resolved,
    name: path.basename(resolved),
    size: st.size,
    mime,
  };
}
