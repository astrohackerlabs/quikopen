/** Page-side decision for the 100ms revision poll. No filesystem access. */
export const REVISION_POLL_MS = 100;

export interface RevisionSnapshot {
  ok: true;
  revision: number;
  available: boolean;
  status?: string;
}

export type RevisionActionData =
  | { ok: false; changed: false }
  | {
      ok: true;
      revision: number;
      available: boolean;
      status?: string;
      changed: boolean;
    };

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

export function seenRevision(raw: string): number | null {
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

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

export function imageUrlWithRevision(
  pageSearch: string,
  revision: number,
): string {
  const page = new URL(pageSearch, "http://127.0.0.1/");
  const next = new URL("/image", "http://127.0.0.1/");
  const token = page.searchParams.get("token");
  const name = page.searchParams.get("name");
  if (token) next.searchParams.set("token", token);
  if (name) next.searchParams.set("name", name);
  next.searchParams.set("v", String(revision));
  return `${next.pathname}${next.search}`;
}

export type RevisionFetch = (input: RequestInfo | URL) => Promise<Response>;

export async function revisionFromRequest(
  request: Request,
  fetchImpl: RevisionFetch,
): Promise<RevisionActionData> {
  const form = await request.formData();
  return pollRevision(
    formField(form, "token"),
    formField(form, "seen"),
    fetchImpl,
  );
}

export async function pollRevision(
  token: string,
  seen: string,
  fetchImpl: RevisionFetch,
): Promise<RevisionActionData> {
  try {
    const response = await fetchImpl(
      `/__quik/revision?token=${encodeURIComponent(token)}`,
    );
    if (!response.ok) return { ok: false, changed: false };
    const body = (await response.json()) as {
      ok?: unknown;
      revision?: unknown;
      available?: unknown;
      status?: unknown;
    };
    if (
      body.ok !== true ||
      typeof body.revision !== "number" ||
      typeof body.available !== "boolean"
    ) {
      return { ok: false, changed: false };
    }
    const decision = applyRevision(seenRevision(seen), {
      ok: true,
      revision: body.revision,
      available: body.available,
    });
    const result: RevisionActionData = {
      ok: true,
      revision: body.revision,
      available: body.available,
      changed: decision.changed,
    };
    if (!body.available && typeof body.status === "string") {
      return { ...result, status: body.status };
    }
    return result;
  } catch {
    return { ok: false, changed: false };
  }
}
