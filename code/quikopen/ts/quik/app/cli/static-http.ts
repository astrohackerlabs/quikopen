/**
 * Pure Bun static HTTP for the quik SPA client build.
 * Used by the compiled binary — no node_modules resolution.
 */
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";

import { resolvePackageRoot } from "./paths";

export type StaticHttpHandler = (request: Request) => Promise<Response>;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function contentType(filePath: string): string {
  const i = filePath.lastIndexOf(".");
  if (i < 0) return "application/octet-stream";
  return MIME[filePath.slice(i)] ?? "application/octet-stream";
}

/**
 * Serve `build/client` with SPA fallback to index.html.
 * Also serves package `public/` for legacy static paths if present.
 */
export function createStaticHttpHandler(
  env: NodeJS.ProcessEnv = process.env,
): StaticHttpHandler {
  const root = resolvePackageRoot(env);
  const clientRoot = join(root, "build", "client");
  const publicRoot = join(root, "public");
  const indexHtml = join(clientRoot, "index.html");

  if (!existsSync(clientRoot) || !existsSync(indexHtml)) {
    throw new Error(
      `quikopen: missing SPA client build at ${clientRoot} (need index.html). Run: bun run --cwd code/quikopen/ts/quik build:quikopen`,
    );
  }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname === "") {
      return new Response(Bun.file(indexHtml), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Prevent path escape
    const rel = pathname.replace(/^\/+/, "");
    const candidates = [join(clientRoot, rel), join(publicRoot, rel)];

    for (const filePath of candidates) {
      const normalized = normalize(filePath);
      if (
        !normalized.startsWith(normalize(clientRoot)) &&
        !normalized.startsWith(normalize(publicRoot))
      ) {
        continue;
      }
      if (existsSync(normalized)) {
        const file = Bun.file(normalized);
        // directory check — Bun.file size 0 for missing; existsSync true for dirs
        try {
          const st = await file.exists();
          if (!st) continue;
        } catch {
          continue;
        }
        return new Response(file, {
          headers: { "content-type": contentType(normalized) },
        });
      }
    }

    // SPA fallback for client routes
    if (request.method === "GET" || request.method === "HEAD") {
      return new Response(Bun.file(indexHtml), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  };
}
