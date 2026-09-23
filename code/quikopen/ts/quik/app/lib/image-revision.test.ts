import { expect, test } from "bun:test";

import {
  applyRevision,
  imageUrlWithRevision,
  pollRevision,
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

test("image URL keeps token and name and adds v", () => {
  expect(imageUrlWithRevision("?token=abc&name=Drawing.svg", 7)).toBe(
    "/image?token=abc&name=Drawing.svg&v=7",
  );
});

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

test("pollRevision reports changed, unchanged, and failed fetches", async () => {
  const calls: string[] = [];
  const fetchImpl = (input: RequestInfo | URL): Promise<Response> => {
    const url = requestUrl(input);
    calls.push(url);
    if (url.includes("missing")) return Promise.reject(new Error("down"));
    if (url.includes("bad")) {
      return Promise.resolve(new Response("no", { status: 404 }));
    }
    const revision = url.includes("newer") ? 2 : 1;
    return Promise.resolve(
      Response.json({ ok: true, revision, available: true }),
    );
  };

  expect(await pollRevision("tok", "", fetchImpl)).toEqual({
    ok: true,
    revision: 1,
    available: true,
    changed: false,
  });
  expect(calls[0]).toContain("token=tok");
  expect(
    await pollRevision("tok", "1", () =>
      Promise.resolve(
        Response.json({
          ok: true,
          revision: 4,
          available: false,
          status: "missing",
        }),
      ),
    ),
  ).toEqual({
    ok: true,
    revision: 4,
    available: false,
    status: "missing",
    changed: true,
  });
  expect(await pollRevision("tok", "9", fetchImpl)).toMatchObject({
    changed: false,
    revision: 1,
  });
  expect(await pollRevision("missing", "", fetchImpl)).toEqual({
    ok: false,
    changed: false,
  });
  expect(await pollRevision("bad", "", fetchImpl)).toEqual({
    ok: false,
    changed: false,
  });
});

test("clientAction reads the form and uses fetch", async () => {
  const body = new URLSearchParams({ token: "session", seen: "1" });
  const request = new Request("http://127.0.0.1/?index", {
    method: "POST",
    body,
  });
  const fetchImpl = (input: RequestInfo | URL): Promise<Response> => {
    expect(requestUrl(input)).toContain("token=session");
    return Promise.resolve(
      Response.json({ ok: true, revision: 3, available: true }),
    );
  };
  expect(await revisionFromRequest(request, fetchImpl)).toEqual({
    ok: true,
    revision: 3,
    available: true,
    changed: true,
  });
});
