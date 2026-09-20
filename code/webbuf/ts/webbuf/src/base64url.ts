// Validate before invoking either Base64 backend, whose permissiveness differs.
const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function requireBoolean(value: boolean): void {
  if (typeof value !== "boolean")
    throw new TypeError("Expected a boolean option");
}

export function base64UrlToBase64(
  text: string,
  stripWhitespace: boolean,
): string {
  requireBoolean(stripWhitespace);
  if (typeof text !== "string") throw new TypeError("Expected Base64url text");
  const input = stripWhitespace ? text.replace(/\s+/g, "") : text;
  if (/[^A-Za-z0-9_\-=]/.test(input))
    throw new TypeError("Invalid Base64url alphabet");
  const firstPad = input.indexOf("=");
  const data = firstPad < 0 ? input : input.slice(0, firstPad);
  const remainder = data.length % 4;
  if (remainder === 1) throw new TypeError("Invalid Base64url length");
  const padding = remainder === 0 ? 0 : 4 - remainder;
  if (
    firstPad >= 0 &&
    (padding === 0 || input.slice(firstPad) !== "=".repeat(padding))
  ) {
    throw new TypeError("Invalid Base64url padding");
  }
  const last = alphabet.indexOf(data.charAt(data.length - 1));
  if (
    (remainder === 2 && (last & 15) !== 0) ||
    (remainder === 3 && (last & 3) !== 0)
  ) {
    throw new TypeError("Noncanonical Base64url trailing bits");
  }
  return data.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padding);
}

export function base64ToBase64Url(text: string, padding: boolean): string {
  const url = text.replace(/\+/g, "-").replace(/\//g, "_");
  return padding ? url : url.replace(/=+$/, "");
}
