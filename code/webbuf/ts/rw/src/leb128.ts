import { WebBuf } from "@webbuf/webbuf";

/** Internal shared implementation; public entry points are reader/writer methods. */
function validateWidth(maxBits: number): void {
  if (!Number.isSafeInteger(maxBits) || maxBits < 1) {
    throw new RangeError("maxBits must be a positive safe integer");
  }
}

function validateRange(value: bigint, maxBits: number, signed: boolean): void {
  if (!signed && value < 0n) throw new RangeError("Unsigned value is negative");
  const magnitude = signed && value < 0n ? ~value : value;
  const bits =
    (magnitude === 0n ? 0 : magnitude.toString(2).length) + (signed ? 1 : 0);
  if (bits > maxBits) throw new RangeError("LEB128 value exceeds maxBits");
}

export function encodeLEB128(
  value: bigint,
  maxBits: number,
  signed: boolean,
): WebBuf {
  if (typeof value !== "bigint") throw new TypeError("Expected bigint");
  validateWidth(maxBits);
  validateRange(value, maxBits, signed);
  const bytes: number[] = [];
  let rest = value;
  let done: boolean;
  do {
    const byte = Number(rest & 0x7fn);
    rest >>= 7n;
    done = signed
      ? (rest === 0n && (byte & 0x40) === 0) ||
        (rest === -1n && (byte & 0x40) !== 0)
      : rest === 0n;
    bytes.push(byte | (done ? 0 : 0x80));
  } while (!done);
  return WebBuf.fromArray(bytes);
}

export function decodeLEB128(
  buf: WebBuf,
  pos: number,
  maxBits: number,
  signed: boolean,
): { value: bigint; next: number } {
  validateWidth(maxBits);
  if (!Number.isSafeInteger(pos) || pos < 0 || pos > buf.length) {
    throw new RangeError("Invalid reader position");
  }
  const limit = Math.ceil(maxBits / 7);
  let value = 0n;
  let shift = 0n;
  let next = pos;
  for (let count = 0; count < limit; count++) {
    if (next >= buf.length) throw new RangeError("Truncated LEB128");
    const byte = buf.bytes[next++];
    if (byte === undefined) throw new RangeError("Truncated LEB128");
    value |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
    if ((byte & 0x80) === 0) {
      if (signed && (byte & 0x40) !== 0) value -= 1n << shift;
      validateRange(value, maxBits, signed);
      return { value, next };
    }
  }
  throw new RangeError("LEB128 exceeds encoded width limit");
}
