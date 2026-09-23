import { expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { IMAGE_MAX_BYTES } from "./image-path.ts";
import {
  advancePublication,
  initialPublication,
  revisionResponse,
  signatureForPath,
  startImageWatch,
  statusForError,
  type DirectoryWatch,
  type DirectoryWatchFactory,
} from "./image-watch.ts";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ff0000"/></svg>`;

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "quik-watch-"));
}

test("statusForError maps resolveImagePath messages", () => {
  expect(statusForError("file not found: drawing.svg")).toBe("missing");
  expect(statusForError("not a file: drawing.svg")).toBe("not-a-file");
  expect(statusForError("image too large (9 bytes; max 8)")).toBe("too-large");
  expect(statusForError("unreadable: drawing.svg")).toBe("unreadable");
  expect(statusForError("unsupported image type: drawing.txt")).toBe(
    "unsupported",
  );
  expect(statusForError("cannot open drawing.svg")).toBe("unreadable");
});

test("advancePublication ignores an unchanged signature", () => {
  const signature = signatureForPath("/missing.svg");
  const first = initialPublication(signature);
  expect(first.revision).toBe(1);
  expect(advancePublication(first, signature)).toBe(first);
  const next = advancePublication(first, {
    key: "2:3:4",
    available: true,
  });
  expect(next.revision).toBe(2);
  expect(next.available).toBe(true);
  expect(next.status).toBeUndefined();
});

test("revisionResponse returns the snapshot and refuses a bad token", async () => {
  const ok = revisionResponse("secret", "secret", {
    revision: 4,
    available: true,
  });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ ok: true, revision: 4, available: true });

  const missing = revisionResponse("secret", "secret", {
    revision: 5,
    available: false,
    status: "missing",
  });
  expect(await missing.json()).toEqual({
    ok: true,
    revision: 5,
    available: false,
    status: "missing",
  });

  const denied = revisionResponse("secret", "nope", {
    revision: 1,
    available: true,
  });
  expect(denied.status).toBe(404);
  expect(await denied.json()).toEqual({
    ok: false,
    error: "missing identity",
  });
});

test("watch publishes writes, renames, siblings, delete, and close", async () => {
  const dir = tempDir();
  const file = join(dir, "drawing.svg");
  writeFileSync(file, svg);
  const watch = startImageWatch(file);
  try {
    expect(watch.snapshot()).toEqual({ revision: 1, available: true });
    writeFileSync(file, svg.replace("#ff0000", "#00ff00"));
    await waitFor(() => watch.snapshot().revision > 1);
    const afterWrite = watch.snapshot().revision;
    const current = readFileSync(file);
    const sameSize = Buffer.from(current);
    sameSize[0] = sameSize[0] === 60 ? 32 : 60;
    expect(sameSize.length).toBe(current.length);
    writeFileSync(file, sameSize);
    await waitFor(() => watch.snapshot().revision > afterWrite);
    const afterSameSize = watch.snapshot().revision;

    writeFileSync(join(dir, "other.svg"), svg);
    await Bun.sleep(300);
    expect(watch.snapshot().revision).toBe(afterSameSize);

    const replaced = join(dir, "next.svg");
    writeFileSync(replaced, svg.replace("#ff0000", "#0000ff"));
    renameSync(replaced, file);
    await waitFor(
      () =>
        watch.snapshot().revision > afterSameSize && watch.snapshot().available,
    );

    rmSync(file);
    await waitFor(() => watch.snapshot().status === "missing");
    writeFileSync(file, svg);
    await waitFor(() => watch.snapshot().available);
    const restored = watch.snapshot().revision;

    rmSync(file);
    mkdirSync(file);
    await waitFor(() => watch.snapshot().status === "not-a-file");
    rmSync(file, { recursive: true });
    writeFileSync(file, Buffer.alloc(IMAGE_MAX_BYTES + 1));
    await waitFor(() => watch.snapshot().status === "too-large");
    expect(watch.snapshot().revision).toBeGreaterThan(restored);

    const frozen = watch.snapshot().revision;
    watch.close();
    watch.close();
    writeFileSync(file, svg);
    await Bun.sleep(200);
    expect(watch.snapshot().revision).toBe(frozen);
  } finally {
    watch.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);

test("a watch error is logged once and armed one more time", () => {
  const dir = tempDir();
  const file = join(dir, "drawing.svg");
  writeFileSync(file, svg);
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]): void => {
    logged.push(args);
  };
  let calls = 0;
  const errors: ((error: Error) => void)[] = [];
  const factory: DirectoryWatchFactory = (_directory, _onEvent, onError) => {
    calls += 1;
    errors.push(onError);
    const handle: DirectoryWatch = { close: () => undefined };
    return handle;
  };
  try {
    const watch = startImageWatch(file, factory);
    errors[0]?.(new Error("watch failed"));
    expect(calls).toBe(2);
    expect(logged).toHaveLength(1);
    errors[1]?.(new Error("watch failed again"));
    expect(calls).toBe(2);
    expect(logged).toHaveLength(1);
    expect(watch.snapshot()).toEqual({ revision: 1, available: true });
    watch.close();
  } finally {
    console.error = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for watch");
    await Bun.sleep(20);
  }
}
