import { WebBuf } from "@webbuf/webbuf";

function encode(
  value: bigint,
  byteLength: number | undefined,
  le: boolean,
): WebBuf {
  if (typeof value !== "bigint") throw new TypeError("Expected bigint");
  if (byteLength !== undefined) {
    if (typeof byteLength !== "number")
      throw new TypeError("Expected numeric byte length");
    if (!Number.isSafeInteger(byteLength) || byteLength < 0)
      throw new RangeError("Byte length must be a nonnegative safe integer");
  }
  const magnitude = value < 0n ? -value : value;
  const minimum = Math.ceil((magnitude.toString(2).length + 1) / 8);
  const length = byteLength ?? minimum;
  if (length < minimum && !(length === 0 && value === 0n))
    throw new RangeError("Signed magnitude does not fit byte length");
  const output = WebBuf.alloc(length);
  let remaining = magnitude;
  for (let i = 0; i < length; i++) {
    output.bytes[le ? i : length - 1 - i] = Number(remaining & 255n);
    remaining >>= 8n;
  }
  if (value < 0n) {
    const index = le ? length - 1 : 0;
    const byte = output.bytes[index];
    if (byte === undefined) throw new RangeError("Missing sign byte");
    output.bytes[index] = byte | 128;
  }
  return output;
}

function decode(bytes: WebBuf, le: boolean): bigint {
  if (!(bytes instanceof WebBuf)) throw new TypeError("Expected WebBuf");
  Uint8Array.prototype.values.call(bytes.bytes);
  const length = bytes.length;
  if (length === 0) return 0n;
  const sign = bytes.bytes[le ? length - 1 : 0];
  if (sign === undefined) throw new TypeError("Invalid byte storage");
  let magnitude = BigInt(sign & 127);
  for (let i = 1; i < length; i++) {
    const byte = bytes.bytes[le ? length - 1 - i : i];
    if (byte === undefined) throw new TypeError("Invalid byte storage");
    magnitude = (magnitude << 8n) | BigInt(byte);
  }
  return sign & 128 ? -magnitude : magnitude;
}

/** Encode LE signed magnitude in independent storage. Default width is minimal
 * and nonempty (zero is 00); explicit width zero accepts only zero. Larger widths
 * zero-pad magnitude, placing sign in the highest byte. Invalid widths/overflow
 * throw, never truncate. Not constant-time; native allocation limits apply. */
export function encodeSignedMagnitudeLE(
  value: bigint,
  byteLength?: number,
): WebBuf {
  return encode(value, byteLength, true);
}

/** BE counterpart of encodeSignedMagnitudeLE; sign is in the first byte. */
export function encodeSignedMagnitudeBE(
  value: bigint,
  byteLength?: number,
): WebBuf {
  return encode(value, byteLength, false);
}

/** Decode selected LE signed-magnitude bytes without mutation. Accept padding,
 * empty input and either zero sign (returning 0n). Invalid input kinds or
 * detached/out-of-bounds storage throw TypeError. Not constant-time. */
export function decodeSignedMagnitudeLE(bytes: WebBuf): bigint {
  return decode(bytes, true);
}

/** BE counterpart of decodeSignedMagnitudeLE; sign is in the first byte. */
export function decodeSignedMagnitudeBE(bytes: WebBuf): bigint {
  return decode(bytes, false);
}
