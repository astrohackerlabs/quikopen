/**
 * Resolve and validate a local SVG path for quik.
 * Realpath, regular file, .svg suffix, readable, size cap.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export const SVG_MAX_BYTES = 8 * 1024 * 1024;

export type SvgPathResult =
  | { ok: true; path: string; name: string; size: number }
  | { ok: false; error: string };

export function resolveSvgPath(input: string): SvgPathResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "missing svg path" };

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
  if (path.extname(resolved).toLowerCase() !== ".svg") {
    return { ok: false, error: `not an svg file: ${raw}` };
  }
  if (st.size > SVG_MAX_BYTES) {
    return {
      ok: false,
      error: `svg too large (${String(st.size)} bytes; max ${String(SVG_MAX_BYTES)})`,
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
  };
}
