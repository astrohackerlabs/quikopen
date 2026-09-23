/**
 * Filesystem watch for the one image this process serves.
 * Events update an in-memory revision. Polls read that revision.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { timingSafeEqualStr } from "./identity.ts";
import {
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  resolveImagePath,
} from "./image-path.ts";

export const IMAGE_WATCH_QUIET_MS = 50;

export type WatchStatus =
  "missing" | "not-a-file" | "unreadable" | "too-large" | "unsupported";

export interface WatchSnapshot {
  revision: number;
  available: boolean;
  status?: WatchStatus;
}

export interface FileSignature {
  key: string;
  available: boolean;
  status?: WatchStatus;
}

export interface Publication {
  revision: number;
  key: string;
  available: boolean;
  status?: WatchStatus;
}

export interface ImageWatch {
  snapshot(): WatchSnapshot;
  close(): void;
}

export interface DirectoryWatch {
  close(): void;
}

export type DirectoryWatchFactory = (
  directory: string,
  onEvent: (filename: string | null) => void,
  onError: (error: Error) => void,
) => DirectoryWatch;

export function statusForError(error: string): WatchStatus {
  if (error.startsWith("file not found")) return "missing";
  if (error.startsWith("not a file")) return "not-a-file";
  if (error.startsWith("image too large")) return "too-large";
  if (error.startsWith("unreadable")) return "unreadable";
  if (error.startsWith("unsupported")) return "unsupported";
  return "unreadable";
}

export function signatureForPath(filePath: string): FileSignature {
  const resolved = resolveImagePath(filePath);
  if (!resolved.ok) {
    const status = statusForError(resolved.error);
    return { key: `unavailable:${status}`, available: false, status };
  }
  let st: fs.Stats;
  try {
    st = fs.statSync(resolved.path);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    const status = code === "ENOENT" ? "missing" : "unreadable";
    return { key: `unavailable:${status}`, available: false, status };
  }
  if (!st.isFile()) {
    return {
      key: "unavailable:not-a-file",
      available: false,
      status: "not-a-file",
    };
  }
  if (!(path.extname(resolved.path).toLowerCase() in IMAGE_TYPES)) {
    return {
      key: "unavailable:unsupported",
      available: false,
      status: "unsupported",
    };
  }
  if (st.size > IMAGE_MAX_BYTES) {
    return {
      key: "unavailable:too-large",
      available: false,
      status: "too-large",
    };
  }
  const mtime = mtimeToken(st);
  return {
    key: `${String(st.ino)}:${mtime}:${String(st.size)}`,
    available: true,
  };
}

export function initialPublication(signature: FileSignature): Publication {
  if (signature.status === undefined) {
    return {
      revision: 1,
      key: signature.key,
      available: signature.available,
    };
  }
  return {
    revision: 1,
    key: signature.key,
    available: signature.available,
    status: signature.status,
  };
}

export function advancePublication(
  previous: Publication,
  signature: FileSignature,
): Publication {
  if (previous.key === signature.key) return previous;
  if (signature.status === undefined) {
    return {
      revision: previous.revision + 1,
      key: signature.key,
      available: signature.available,
    };
  }
  return {
    revision: previous.revision + 1,
    key: signature.key,
    available: signature.available,
    status: signature.status,
  };
}

export function snapshotOf(publication: Publication): WatchSnapshot {
  if (publication.available) {
    return { revision: publication.revision, available: true };
  }
  if (publication.status === undefined) {
    return { revision: publication.revision, available: false };
  }
  return {
    revision: publication.revision,
    available: false,
    status: publication.status,
  };
}

export function revisionResponse(
  expectedToken: string,
  got: string | null,
  snapshot: WatchSnapshot,
): Response {
  if (!got || !timingSafeEqualStr(got, expectedToken)) {
    return Response.json(
      { ok: false, error: "missing identity" },
      { status: 404 },
    );
  }
  if (snapshot.available) {
    return Response.json({
      ok: true,
      revision: snapshot.revision,
      available: true,
    });
  }
  return Response.json({
    ok: true,
    revision: snapshot.revision,
    available: false,
    status: snapshot.status,
  });
}

function mtimeToken(st: fs.Stats): string {
  const candidate: unknown = Reflect.get(st, "mtimeNs");
  if (typeof candidate === "bigint") return candidate.toString();
  return String(st.mtimeMs);
}

function fsDirectoryWatch(
  directory: string,
  onEvent: (filename: string | null) => void,
  onError: (error: Error) => void,
): DirectoryWatch {
  const watcher = fs.watch(
    directory,
    { persistent: true },
    (_event, filename) => {
      onEvent(filename ?? null);
    },
  );
  watcher.on("error", (error) => {
    onError(error instanceof Error ? error : new Error(String(error)));
  });
  return {
    close: () => {
      watcher.close();
    },
  };
}

export function startImageWatch(
  filePath: string,
  createWatch: DirectoryWatchFactory = fsDirectoryWatch,
): ImageWatch {
  const directory = path.dirname(filePath);
  const base = path.basename(filePath);
  let publication = initialPublication(signatureForPath(filePath));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watcher: DirectoryWatch | null = null;
  let closed = false;
  let rearmed = false;
  let logged = false;

  function publish(): void {
    publication = advancePublication(publication, signatureForPath(filePath));
  }

  function schedule(filename: string | null): void {
    if (closed) return;
    if (filename !== null && path.basename(filename) !== base) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!closed) publish();
    }, IMAGE_WATCH_QUIET_MS);
  }

  function arm(): void {
    watcher = createWatch(
      directory,
      (filename) => {
        schedule(filename);
      },
      (error) => {
        if (closed) return;
        try {
          watcher?.close();
        } catch {
          /* already closed */
        }
        watcher = null;
        if (!logged) {
          console.error(error);
          logged = true;
        }
        if (rearmed) return;
        rearmed = true;
        try {
          arm();
        } catch {
          /* keep the last snapshot */
        }
      },
    );
  }

  try {
    arm();
  } catch (error) {
    console.error(error);
    logged = true;
    rearmed = true;
    try {
      arm();
    } catch {
      /* keep the last snapshot */
    }
  }

  return {
    snapshot: () => snapshotOf(publication),
    close: () => {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      try {
        watcher?.close();
      } catch {
        /* already closed */
      }
      watcher = null;
    },
  };
}
