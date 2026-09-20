import { WebBuf } from "@webbuf/webbuf";

function decode(bytes: WebBuf, littleEndian: boolean): bigint {
  if (!(bytes instanceof WebBuf)) throw new TypeError("Expected WebBuf");
  // Validate storage before treating a zero length as empty.
  Uint8Array.prototype.values.call(bytes.bytes);
  const length = bytes.length;
  if (length === 0) return 0n;
  const sign = bytes.bytes[littleEndian ? length - 1 : 0];
  if (sign === undefined) throw new TypeError("Invalid byte storage");
  let value = sign & 0x80 ? -1n : 0n;
  for (let i = 0; i < length; i++) {
    const byte = bytes.bytes[littleEndian ? length - 1 - i : i];
    if (byte === undefined) throw new TypeError("Invalid byte storage");
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function encode(
  value: bigint,
  byteLength: number | undefined,
  littleEndian: boolean,
): WebBuf {
  if (typeof value !== "bigint") throw new TypeError("Expected bigint");
  if (byteLength !== undefined) {
    if (typeof byteLength !== "number")
      throw new TypeError("Expected numeric byte length");
    if (!Number.isSafeInteger(byteLength) || byteLength < 0)
      throw new RangeError("Byte length must be a nonnegative safe integer");
  }
  // Complement negative values to find their significant bits excluding sign.
  const significant = value < 0n ? ~value : value;
  const minimum = Math.ceil((significant.toString(2).length + 1) / 8);
  const length = byteLength ?? minimum;
  if (length < minimum && !(length === 0 && value === 0n))
    throw new RangeError("Signed value does not fit byte length");
  const output = WebBuf.alloc(length);
  let remaining = value;
  for (let i = 0; i < length; i++) {
    output.bytes[littleEndian ? i : length - 1 - i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

/**
 * Decode selected big-endian two's-complement bytes, accepting sign extension.
 * Empty input is 0n. No mutation or copying; invalid kinds and detached or
 * out-of-bounds storage throw TypeError. Not a constant-time operation.
 */
export function decodeSignedBE(bytes: WebBuf): bigint {
  return decode(bytes, false);
}

/**
 * Decode selected little-endian two's-complement bytes, accepting sign extension.
 * Empty input is 0n. No mutation or copying; invalid kinds and detached or
 * out-of-bounds storage throw TypeError. Not a constant-time operation.
 */
export function decodeSignedLE(bytes: WebBuf): bigint {
  return decode(bytes, true);
}

/**
 * Encode bigint as big-endian two's complement in independent storage.
 * Default width is minimal and nonempty (zero is 00). Explicit nonnegative
 * safe-integer byteLength sign-extends exactly; width zero accepts only zero.
 * Overflow or invalid numeric width throws RangeError; wrong argument kinds
 * throw TypeError. Never truncates. Native allocation limits still apply.
 * No constant-time or secure-erasure guarantee.
 */
export function encodeSignedBE(value: bigint, byteLength?: number): WebBuf {
  return encode(value, byteLength, false);
}

/**
 * Encode bigint as little-endian two's complement in independent storage.
 * Default width is minimal and nonempty (zero is 00). Explicit nonnegative
 * safe-integer byteLength sign-extends exactly; width zero accepts only zero.
 * Overflow or invalid numeric width throws RangeError; wrong argument kinds
 * throw TypeError. Never truncates. Native allocation limits still apply.
 * No constant-time or secure-erasure guarantee.
 */
export function encodeSignedLE(value: bigint, byteLength?: number): WebBuf {
  return encode(value, byteLength, true);
}
