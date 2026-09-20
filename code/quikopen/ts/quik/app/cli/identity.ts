import { randomBytes } from "node:crypto";

export function mintToken(): string {
  return randomBytes(16).toString("hex");
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export function buildQuikUrl(
  port: number,
  token: string,
  name: string,
): string {
  const u = new URL(`http://127.0.0.1:${String(port)}/`);
  u.searchParams.set("token", token);
  u.searchParams.set("name", name);
  return u.toString();
}

export function parseTokenFromUrl(url: string): string | null {
  try {
    const u = new URL(url, "http://127.0.0.1");
    const token = u.searchParams.get("token");
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}
