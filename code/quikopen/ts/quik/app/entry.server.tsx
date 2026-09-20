/**
 * Bun-compatible SSR entry — renderToReadableStream (not pipeable).
 */
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
): Promise<Response> {
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  let shellRendered = false;
  const userAgent = request.headers.get("user-agent");
  const waitForAll =
    (userAgent !== null && isbot(userAgent)) || routerContext.isSpaMode;
  let status = responseStatusCode;
  const controller = new AbortController();
  const timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => {
      controller.abort();
    },
    streamTimeout + 1000,
  );

  try {
    const stream = await renderToReadableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        signal: controller.signal,
        onError(error: unknown) {
          status = 500;
          if (shellRendered) console.error(error);
        },
      },
    );
    shellRendered = true;
    if (waitForAll) await stream.allReady;
    responseHeaders.set("Content-Type", "text/html");
    return new Response(stream, { headers: responseHeaders, status });
  } finally {
    clearTimeout(timeoutId);
  }
}
