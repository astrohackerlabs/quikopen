/* oxlint-disable typescript/no-non-null-assertion -- existing definite assignment after guards */
/**
 * Minimal TermSurf wire encoder: 4-byte LE length + protobuf TermSurfMessage.
 * Implements SetOverlay (field 19) only — enough for quik full-pane open.
 * Spec: code/termsurf/proto/termsurf.proto; framing matches code/termsurf/rs/ahweb ipc.rs.
 *
 * WebBuf domain buffers. Sequential assembly via @webbuf/rw BufWriter.
 *
 * IMPORTANT: protobuf field/length varints are LEB128. Do NOT use
 * BufWriter.writeVarIntU64BE — that is Bitcoin CompactSize, not protobuf.
 */
import { U32LE } from "@webbuf/numbers";
import { BufReader, BufWriter } from "@webbuf/rw";
import { WebBuf } from "@webbuf/webbuf";

export interface SetOverlayFields {
  paneId: string;
  col: number;
  row: number;
  width: number;
  height: number;
  url: string;
  profile: string;
  browsing: boolean;
  browser: string;
}

const DEFAULTS = {
  profile: "default",
  browser: "",
  browsing: true,
} as const;

export function setOverlayDefaults(
  partial: Omit<SetOverlayFields, "profile" | "browser" | "browsing"> &
    Partial<Pick<SetOverlayFields, "profile" | "browser" | "browsing">>,
): SetOverlayFields {
  return {
    profile: partial.profile ?? DEFAULTS.profile,
    browser: partial.browser ?? DEFAULTS.browser,
    browsing: partial.browsing ?? DEFAULTS.browsing,
    paneId: partial.paneId,
    col: partial.col,
    row: partial.row,
    width: partial.width,
    height: partial.height,
    url: partial.url,
  };
}

/** Protobuf unsigned LEB128 (not Bitcoin CompactSize / writeVarIntU64BE). */
function writeProtobufVarint(n: number, maxBits = 32): WebBuf {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError("Expected a nonnegative safe integer");
  }
  return new BufWriter().writeULEB128(BigInt(n), maxBits).toBuf();
}

function encodeKey(fieldNumber: number, wireType: number): WebBuf {
  return writeProtobufVarint((fieldNumber << 3) | wireType);
}

function encodeString(fieldNumber: number, value: string): WebBuf {
  const data = WebBuf.fromUtf8(value);
  const w = new BufWriter();
  w.write(encodeKey(fieldNumber, 2));
  w.write(writeProtobufVarint(data.length));
  w.write(data);
  return w.toBuf();
}

function encodeUint64(fieldNumber: number, value: number): WebBuf {
  const w = new BufWriter();
  w.write(encodeKey(fieldNumber, 0));
  w.write(writeProtobufVarint(value, 64));
  return w.toBuf();
}

function encodeBool(fieldNumber: number, value: boolean): WebBuf {
  return encodeUint64(fieldNumber, value ? 1 : 0);
}

/** Encode SetOverlay message body (not wrapped). */
export function encodeSetOverlayMessage(fields: SetOverlayFields): WebBuf {
  const w = new BufWriter();
  w.write(encodeString(1, fields.paneId));
  w.write(encodeUint64(2, fields.col));
  w.write(encodeUint64(3, fields.row));
  w.write(encodeUint64(4, fields.width));
  w.write(encodeUint64(5, fields.height));
  w.write(encodeString(6, fields.url));
  w.write(encodeString(7, fields.profile));
  w.write(encodeBool(8, fields.browsing));
  w.write(encodeString(9, fields.browser));
  return w.toBuf();
}

/**
 * Encode TermSurfMessage { set_overlay: ... } (oneof field 19).
 */
export function encodeTermSurfSetOverlay(fields: SetOverlayFields): WebBuf {
  const inner = encodeSetOverlayMessage(fields);
  const w = new BufWriter();
  w.write(encodeKey(19, 2)); // set_overlay = 19, length-delimited
  w.write(writeProtobufVarint(inner.length));
  w.write(inner);
  return w.toBuf();
}

/** Length-prefixed frame for the host Unix socket (u32 LE length + payload). */
export function frameTermSurfMessage(payload: WebBuf): WebBuf {
  const w = new BufWriter();
  w.writeU32LE(U32LE.fromN(payload.length));
  w.write(payload);
  return w.toBuf();
}

export function buildSetOverlayFrame(fields: SetOverlayFields): WebBuf {
  return frameTermSurfMessage(encodeTermSurfSetOverlay(fields));
}

/** Decode only enough to assert round-trip in tests (field presence). */
export function peekSetOverlayUrl(frame: WebBuf): string | null {
  try {
    if (frame.length < 5) return null;
    const len = new BufReader(frame).readU32LE().n;
    if (len > frame.length - 4) throw new WireParseError("Truncated frame");
    const payload = frame.subarray(4, 4 + len);
    let i = 0;
    while (i < payload.length) {
      const { value: tag, next } = readTag(payload, i);
      i = next;
      const field = tag >>> 3;
      const wt = tag & 7;
      if (wt === 2) {
        const { value: l, next: n2 } = readProtobufVarint(payload, i);
        i = n2;
        const slice = payload.subarray(i, checkedEnd(payload, i, l));
        i += l;
        if (field === 19) {
          return peekStringField(slice, 6);
        }
      } else if (wt === 0) {
        ({ next: i } = readProtobufBigInt(payload, i));
      } else {
        return null;
      }
    }
    return null;
  } catch (error) {
    if (error instanceof WireParseError) return null;
    throw error;
  }
}

class WireParseError extends RangeError {}

function readProtobufBigInt(
  buf: WebBuf,
  i: number,
  maxBits = 64,
): { value: bigint; next: number } {
  const reader = new BufReader(buf);
  reader.pos = i;
  try {
    const value = reader.readULEB128(maxBits);
    return { value, next: reader.pos };
  } catch (error) {
    if (error instanceof RangeError) throw new WireParseError(error.message);
    throw error;
  }
}

function readProtobufVarint(
  buf: WebBuf,
  i: number,
  maxBits = 32,
): { value: number; next: number } {
  const { value, next } = readProtobufBigInt(buf, i, maxBits);
  return { value: safeWireNumber(value), next };
}

function safeWireNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new WireParseError("Unsafe integer field");
  return Number(value);
}

function checkedEnd(buf: WebBuf, start: number, length: number): number {
  if (start < 0 || length < 0 || length > buf.length - start) {
    throw new WireParseError("Truncated message field");
  }
  return start + length;
}

function readTag(buf: WebBuf, i: number): { value: number; next: number } {
  const tag = readProtobufVarint(buf, i);
  if (tag.value >>> 3 === 0 || (tag.value & 7) > 5) {
    throw new WireParseError("Invalid protobuf tag");
  }
  return tag;
}

function peekStringField(buf: WebBuf, wantField: number): string | null {
  let i = 0;
  while (i < buf.length) {
    const { value: tag, next } = readTag(buf, i);
    i = next;
    const field = tag >>> 3;
    const wt = tag & 7;
    if (wt === 2) {
      const { value: l, next: n2 } = readProtobufVarint(buf, i);
      i = n2;
      const slice = buf.subarray(i, checkedEnd(buf, i, l));
      i += l;
      if (field === wantField) {
        return slice.toUtf8();
      }
    } else if (wt === 0) {
      ({ next: i } = readProtobufBigInt(buf, i));
    } else {
      break;
    }
  }
  return null;
}
