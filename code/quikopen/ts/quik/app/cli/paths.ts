import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Package root for SPA assets (`build/client`, `public/`).
 * Compiled binary must not trust import.meta ($bunfs) — use execPath / env.
 */
export function resolvePackageRoot(
  env: NodeJS.ProcessEnv = process.env,
  execPath: string = process.execPath,
): string {
  const fromEnv = env.QUIK_PKG_ROOT?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (fs.existsSync(resolved)) return resolved;
  }

  const execDir = path.dirname(path.resolve(execPath));
  if (path.basename(execDir) === "dist") {
    const candidate = path.dirname(execDir);
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  if (path.basename(execPath) === "quikopen") {
    if (fs.existsSync(path.join(execDir, "package.json"))) {
      return execDir;
    }
  }

  try {
    const fromMeta = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    if (fs.existsSync(path.join(fromMeta, "package.json"))) {
      return fromMeta;
    }
  } catch {
    /* compiled may lack usable import.meta */
  }

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    const nested = path.join(cwd, "code", "quikopen", "ts", "quik");
    if (fs.existsSync(path.join(nested, "package.json"))) return nested;
    return cwd;
  }

  throw new Error(
    "cannot resolve QUIK_PKG_ROOT (set env or run dist/quikopen from package tree)",
  );
}
