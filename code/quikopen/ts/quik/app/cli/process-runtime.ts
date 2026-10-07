/**
 * One-process quik runtime: this process owns HTTP + TermSurf overlay and
 * serves one to nine images by index.
 * No UDS, no shared daemon, no --server role.
 */
import type { Readable } from "node:stream";

import { bindRuntimePort } from "./runtime-port.ts";
import { mintToken, timingSafeEqualStr, buildQuikUrl } from "./identity.ts";
import { imageDisposition, resolveImagePath } from "./image-path.ts";
import {
  createStaticHttpHandler,
  type StaticHttpHandler,
} from "./static-http.ts";
import { readTerminalGeometry } from "./geometry.ts";
import {
  readTermSurfEnv,
  TermSurfClient,
  type OverlayOptions,
} from "./termsurf-client.ts";
import { watchEscInput } from "./tty-esc.ts";
import {
  revisionResponse,
  startImageWatch,
  type ImageWatch,
} from "./image-watch.ts";

export interface ImageFile {
  path: string;
  name: string;
}

export interface ProcessHandles {
  token: string;
  port: number;
  http: ReturnType<typeof Bun.serve>;
  termsurf: TermSurfClient | null;
  close: () => void;
  requestExit: (reason: string) => void;
  /** Terminal Left/Right arrows: moves the Single-mode selection. */
  navigate: (step: number) => void;
}

export interface WaitForExitOptions {
  stdin?: Readable;
  enableTtyRaw?: boolean;
}

function tokenFromUrl(url: URL): string | null {
  const query = url.searchParams.get("token");
  return query && query.length > 0 ? query : null;
}

/** `i` query index; absent means the first image. Malformed is out of range. */
function imageIndex(url: URL): number {
  const raw = url.searchParams.get("i");
  if (raw === null) return 0;
  return /^\d+$/.test(raw) ? Number(raw) : -1;
}

async function tokenFromBody(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as { token?: string };
    return typeof body.token === "string" && body.token.length > 0
      ? body.token
      : null;
  } catch {
    return null;
  }
}

export async function startProcess(
  env: NodeJS.ProcessEnv = process.env,
  overlay: OverlayOptions = {},
  images: ImageFile[],
): Promise<ProcessHandles> {
  const first = images[0];
  if (!first) throw new Error("quikopen: no images");
  const skipTs = env.QUIK_SKIP_TERMSURF === "1";
  const tsEnv = readTermSurfEnv(env);
  if (!skipTs && "error" in tsEnv) {
    throw new Error(tsEnv.error);
  }

  const staticHttp = createStaticHttpHandler(env);
  const token = mintToken();
  const watches = images.map((image) => startImageWatch(image.path));
  let nav = 0;
  let queuedExit: string | null = null;

  const handles: ProcessHandles = {
    token,
    port: 0,
    http: null as unknown as ReturnType<typeof Bun.serve>,
    termsurf: null,
    close: () => {
      /* replaced after bind */
    },
    requestExit: (reason: string): void => {
      queuedExit ??= reason;
    },
    navigate: (step: number): void => {
      nav += step;
    },
  };

  const http = bindRuntimePort((bindPort) =>
    Bun.serve({
      hostname: "127.0.0.1",
      port: bindPort,
      fetch: (req) =>
        handleHttp(req, {
          staticHttp,
          token,
          images,
          watches,
          nav: () => nav,
          onExit: () => {
            handles.requestExit("ui-x");
          },
        }),
    }),
  );

  const port = http.port;
  if (!port) {
    throw new Error("quikopen: failed to bind HTTP");
  }
  handles.port = port;
  handles.http = http;

  const url = buildQuikUrl(port, token, first.name);

  if (!skipTs && !("error" in tsEnv)) {
    const geometry = readTerminalGeometry(env);
    handles.termsurf = await TermSurfClient.connect(
      tsEnv,
      url,
      geometry,
      overlay,
    );
    process.on("SIGWINCH", () => {
      try {
        handles.termsurf?.resize(readTerminalGeometry(env));
      } catch {
        /* */
      }
    });
  }

  let closed = false;
  handles.close = (): void => {
    if (closed) return;
    closed = true;
    for (const watch of watches) watch.close();
    try {
      handles.termsurf?.close();
    } catch {
      /* */
    }
    try {
      void http.stop(true);
    } catch {
      /* */
    }
  };

  // If UI × arrived before waitForExit, keep the queued reason on the handle.
  (
    handles as ProcessHandles & { _queuedExit: () => string | null }
  )._queuedExit = (): string | null => queuedExit;

  return handles;
}

async function handleHttp(
  request: Request,
  ctx: {
    staticHttp: StaticHttpHandler;
    token: string;
    images: ImageFile[];
    watches: ImageWatch[];
    nav: () => number;
    onExit: () => void;
  },
): Promise<Response> {
  const url = new URL(request.url);

  if (
    url.pathname === "/image" &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const got = tokenFromUrl(url);
    if (!got || !timingSafeEqualStr(got, ctx.token)) {
      return new Response("missing identity", { status: 404 });
    }
    const image = ctx.images[imageIndex(url)];
    if (!image) return new Response("no such image", { status: 404 });
    const again = resolveImagePath(image.path);
    if (!again.ok) {
      return new Response(again.error, { status: 404 });
    }
    const file = Bun.file(again.path);
    return new Response(request.method === "HEAD" ? null : file, {
      headers: {
        "content-type": again.mime,
        "x-content-type-options": "nosniff",
        "content-disposition": imageDisposition(again.name),
        "cache-control": "no-store",
      },
    });
  }

  if (url.pathname === "/__quik/revision" && request.method === "GET") {
    return revisionResponse(
      ctx.token,
      tokenFromUrl(url),
      ctx.watches.map((watch) => watch.snapshot()),
      ctx.nav(),
    );
  }

  if (url.pathname === "/__quik/meta" && request.method === "GET") {
    const got = tokenFromUrl(url);
    if (!got || !timingSafeEqualStr(got, ctx.token)) {
      return Response.json(
        { ok: false, error: "missing identity" },
        { status: 404 },
      );
    }
    return Response.json({
      ok: true,
      images: ctx.images.map((image) => ({ name: image.name })),
    });
  }

  if (url.pathname === "/__quik/exit" && request.method === "POST") {
    const got = (await tokenFromBody(request)) ?? tokenFromUrl(url);
    if (!got || !timingSafeEqualStr(got, ctx.token)) {
      return Response.json(
        { ok: false, error: "missing identity" },
        { status: 404 },
      );
    }
    setTimeout(() => {
      ctx.onExit();
    }, 0);
    return Response.json({ ok: true });
  }

  if (url.pathname === "/__quik/status" && request.method === "GET") {
    return Response.json({ ok: true, port: Number(url.port) });
  }

  try {
    return await ctx.staticHttp(request);
  } catch (error) {
    if (!(request.signal.aborted && error === request.signal.reason)) {
      console.error(error);
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * Wait until the process should exit: UI ×, SIGINT, SIGTERM, or Esc on stdin.
 */
export function waitForExit(
  handles: ProcessHandles,
  opts: WaitForExitOptions = {},
): Promise<string> {
  return new Promise((resolve) => {
    let finished = false;
    let escWatch: ReturnType<typeof watchEscInput> | null = null;

    const cleanupSignals = (): void => {
      process.off("SIGINT", onSig);
      process.off("SIGTERM", onSig);
      try {
        escWatch?.stop();
      } catch {
        /* */
      }
      escWatch = null;
    };

    const done = (reason: string): void => {
      if (finished) return;
      finished = true;
      cleanupSignals();
      handles.close();
      resolve(reason);
    };

    const previous = handles.requestExit;
    handles.requestExit = (reason: string): void => {
      previous(reason);
      done(reason);
    };

    const queued = (
      handles as ProcessHandles & { _queuedExit?: () => string | null }
    )._queuedExit?.();
    if (queued !== null && queued !== undefined) {
      done(queued);
      return;
    }

    const onSig = (): void => {
      done("sigint");
    };
    process.once("SIGINT", onSig);
    process.once("SIGTERM", onSig);

    const input = opts.stdin ?? process.stdin;
    const enableRaw = opts.enableTtyRaw ?? input === process.stdin;
    try {
      escWatch = watchEscInput(
        input,
        {
          onEsc: () => {
            done("esc");
          },
          onCtrlC: () => {
            done("sigint");
          },
          onArrow: (step) => {
            handles.navigate(step);
          },
        },
        { enableRawMode: enableRaw },
      );
    } catch {
      /* stdin may be unavailable; SIGINT/UI still work */
    }
  });
}
