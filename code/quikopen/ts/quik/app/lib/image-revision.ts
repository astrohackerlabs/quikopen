/** Page-side decisions for the 100ms revision poll. No filesystem access. */
export const REVISION_POLL_MS = 100;

/** One image's published revision, as reported by `/__quik/revision`. */
export interface ImageRevision {
  revision: number;
  available: boolean;
  status?: string;
}

/**
 * One poll covers every image. `nav` is the process's cumulative count of
 * terminal Right (+1) and Left (−1) arrow keys.
 */
export type RevisionActionData =
  | { ok: false }
  | { ok: true; revisions: ImageRevision[]; nav: number };

export interface RevisionDecision {
  applied: number | null;
  changed: boolean;
  available: boolean;
  showError: boolean;
}

function formField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Decide one image's reload from its last applied revision. */
export function applyRevision(
  applied: number | null,
  snapshot: { ok: boolean; revision?: number; available?: boolean },
): RevisionDecision {
  if (
    !snapshot.ok ||
    snapshot.revision === undefined ||
    snapshot.available === undefined
  ) {
    return {
      applied,
      changed: false,
      available: applied === null ? true : snapshot.available !== false,
      showError: false,
    };
  }
  if (applied === null) {
    if (snapshot.revision === 1 && snapshot.available) {
      return {
        applied: 1,
        changed: false,
        available: true,
        showError: false,
      };
    }
    return {
      applied: snapshot.revision,
      changed: true,
      available: snapshot.available,
      showError: !snapshot.available,
    };
  }
  if (snapshot.revision <= applied) {
    return {
      applied,
      changed: false,
      available: snapshot.available,
      showError: false,
    };
  }
  return {
    applied: snapshot.revision,
    changed: true,
    available: snapshot.available,
    showError: !snapshot.available,
  };
}

/** `/image` URL for image `index`, keeping the page token; `v` busts caches. */
export function imageUrl(
  pageSearch: string,
  index: number,
  revision: number | null = null,
): string {
  const page = new URL(pageSearch, "http://127.0.0.1/");
  const next = new URL("/image", "http://127.0.0.1/");
  const token = page.searchParams.get("token");
  if (token) next.searchParams.set("token", token);
  next.searchParams.set("i", String(index));
  if (revision !== null) next.searchParams.set("v", String(revision));
  return `${next.pathname}${next.search}`;
}

export type RevisionFetch = (input: RequestInfo | URL) => Promise<Response>;

export async function revisionFromRequest(
  request: Request,
  fetchImpl: RevisionFetch,
): Promise<RevisionActionData> {
  const form = await request.formData();
  return pollRevisions(formField(form, "token"), fetchImpl);
}

function parseRevision(value: unknown): ImageRevision | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as {
    revision?: unknown;
    available?: unknown;
    status?: unknown;
  };
  if (
    typeof entry.revision !== "number" ||
    typeof entry.available !== "boolean"
  ) {
    return null;
  }
  if (!entry.available && typeof entry.status === "string") {
    return {
      revision: entry.revision,
      available: false,
      status: entry.status,
    };
  }
  return { revision: entry.revision, available: entry.available };
}

export async function pollRevisions(
  token: string,
  fetchImpl: RevisionFetch,
): Promise<RevisionActionData> {
  try {
    const response = await fetchImpl(
      `/__quik/revision?token=${encodeURIComponent(token)}`,
    );
    if (!response.ok) return { ok: false };
    const body = (await response.json()) as {
      ok?: unknown;
      revisions?: unknown;
      nav?: unknown;
    };
    if (body.ok !== true || !Array.isArray(body.revisions)) {
      return { ok: false };
    }
    const revisions: ImageRevision[] = [];
    for (const value of body.revisions) {
      const entry = parseRevision(value);
      if (entry === null) return { ok: false };
      revisions.push(entry);
    }
    const nav =
      typeof body.nav === "number" && Number.isInteger(body.nav) ? body.nav : 0;
    return { ok: true, revisions, nav };
  } catch {
    return { ok: false };
  }
}
