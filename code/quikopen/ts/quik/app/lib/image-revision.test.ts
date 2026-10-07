import { expect, test } from "bun:test";

import {
  applyRevision,
  imageUrl,
  pollRevisions,
  revisionFromRequest,
  REVISION_POLL_MS,
} from "./image-revision.ts";

test("revision poll interval is 100ms", () => {
  expect(REVISION_POLL_MS).toBe(100);
});

test("applyRevision adopts startup and ignores older snapshots", () => {
  expect(
    applyRevision(null, { ok: true, revision: 1, available: true }),
  ).toEqual({ applied: 1, changed: false, available: true, showError: false });
  expect(
    applyRevision(null, { ok: true, revision: 2, available: true }),
  ).toEqual({ applied: 2, changed: true, available: true, showError: false });
  expect(
    applyRevision(null, { ok: true, revision: 2, available: false }),
  ).toEqual({ applied: 2, changed: true, available: false, showError: true });
  expect(applyRevision(3, { ok: true, revision: 2, available: true })).toEqual({
    applied: 3,
    changed: false,
    available: true,
    showError: false,
  });
  expect(applyRevision(3, { ok: true, revision: 4, available: false })).toEqual(
    {
      applied: 4,
      changed: true,
      available: false,
      showError: true,
    },
  );
  expect(applyRevision(3, { ok: false })).toEqual({
    applied: 3,
    changed: false,
    available: true,
    showError: false,
  });
});

test("image URL keeps only the token and adds the index and revision", () => {
  expect(imageUrl("?token=abc&name=Drawing.svg", 0)).toBe(
    "/image?token=abc&i=0",
  );
  expect(imageUrl("?token=abc&name=Drawing.svg", 4, 7)).toBe(
    "/image?token=abc&i=4&v=7",
  );
});

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

test("pollRevisions parses every image, nav, and failures", async () => {
  const calls: string[] = [];
  const fetchImpl = (input: RequestInfo | URL): Promise<Response> => {
    const url = requestUrl(input);
    calls.push(url);
    if (url.includes("missing")) return Promise.reject(new Error("down"));
    if (url.includes("bad")) {
      return Promise.resolve(new Response("no", { status: 404 }));
    }
    if (url.includes("legacy")) {
      return Promise.resolve(
        Response.json({ ok: true, revision: 1, available: true }),
      );
    }
    if (url.includes("broken")) {
      return Promise.resolve(
        Response.json({ ok: true, revisions: [{ revision: "x" }], nav: 0 }),
      );
    }
    return Promise.resolve(
      Response.json({
        ok: true,
        revisions: [
          { revision: 1, available: true },
          { revision: 4, available: false, status: "missing" },
        ],
        nav: 3,
      }),
    );
  };

  expect(await pollRevisions("tok", fetchImpl)).toEqual({
    ok: true,
    revisions: [
      { revision: 1, available: true },
      { revision: 4, available: false, status: "missing" },
    ],
    nav: 3,
  });
  expect(calls[0]).toContain("token=tok");
  for (const token of ["missing", "bad", "legacy", "broken"]) {
    expect(await pollRevisions(token, fetchImpl)).toEqual({ ok: false });
  }
});

test("clientAction reads the form token and uses fetch", async () => {
  const body = new URLSearchParams({ token: "session" });
  const request = new Request("http://127.0.0.1/?index", {
    method: "POST",
    body,
  });
  const fetchImpl = (input: RequestInfo | URL): Promise<Response> => {
    expect(requestUrl(input)).toContain("token=session");
    return Promise.resolve(
      Response.json({
        ok: true,
        revisions: [{ revision: 3, available: true }],
      }),
    );
  };
  expect(await revisionFromRequest(request, fetchImpl)).toEqual({
    ok: true,
    revisions: [{ revision: 3, available: true }],
    nav: 0,
  });
});
