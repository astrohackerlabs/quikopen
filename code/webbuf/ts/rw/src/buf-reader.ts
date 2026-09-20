import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import { decodeLEB128 } from "./leb128.js";
import {
  U8,
  U16BE,
  U32BE,
  U64BE,
  U128BE,
  U256BE,
  U16LE,
  U32LE,
  U64LE,
  U128LE,
  U256LE,
} from "@webbuf/numbers";

export class BufReader {
  buf: WebBuf;
  pos: number;

  constructor(buf: WebBuf) {
    this.buf = buf;
    this.pos = 0;
  }

  eof(): boolean {
    return this.pos >= this.buf.length;
  }

  /** Read unsigned LEB128, accepting bounded padding; advance only on success. */
  readULEB128(maxBits = 64): bigint {
    const { value, next } = decodeLEB128(this.buf, this.pos, maxBits, false);
    this.pos = next;
    return value;
  }

  /** Read signed LEB128 (not protobuf ZigZag); advance only on success. */
  readSLEB128(maxBits = 64): bigint {
    const { value, next } = decodeLEB128(this.buf, this.pos, maxBits, true);
    this.pos = next;
    return value;
  }

  read(len: number): WebBuf {
    if (this.pos + len > this.buf.length) {
      throw new Error("not enough bytes in the buffer to read");
    }
    const buf = this.buf.subarray(this.pos, this.pos + len);
    const newBuf = WebBuf.alloc(len);
    newBuf.set(buf);
    this.pos += len;
    return newBuf;
  }

  readFixed<N extends number>(len: N): FixedBuf<N> {
    const isoBuf = this.read(len);
    return FixedBuf.fromBuf(len, isoBuf);
  }

  readRemainder(): WebBuf {
    return this.read(this.buf.length - this.pos);
  }

  readU8(): U8 {
    let val: U8;
    try {
      val = U8.fromBEBuf(
        FixedBuf.fromBuf(1, this.buf.subarray(this.pos, this.pos + 1)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 1;
    return val;
  }

  readU16BE(): U16BE {
    let val: U16BE;
    try {
      val = U16BE.fromBEBuf(
        FixedBuf.fromBuf(2, this.buf.subarray(this.pos, this.pos + 2)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 2;
    return val;
  }

  readU32BE(): U32BE {
    let val: U32BE;
    try {
      val = U32BE.fromBEBuf(
        FixedBuf.fromBuf(4, this.buf.subarray(this.pos, this.pos + 4)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 4;
    return val;
  }

  readU64BE(): U64BE {
    let val: U64BE;
    try {
      val = U64BE.fromBEBuf(
        FixedBuf.fromBuf(8, this.buf.subarray(this.pos, this.pos + 8)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 8;
    return val;
  }

  readU128BE(): U128BE {
    let val: U128BE;
    try {
      val = U128BE.fromBEBuf(
        FixedBuf.fromBuf(16, this.buf.subarray(this.pos, this.pos + 16)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 16;
    return val;
  }

  readU256BE(): U256BE {
    let val: U256BE;
    try {
      val = U256BE.fromBEBuf(
        FixedBuf.fromBuf(32, this.buf.subarray(this.pos, this.pos + 32)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 32;
    return val;
  }

  readU16LE(): U16LE {
    let val: U16LE;
    try {
      val = U16LE.fromLEBuf(
        FixedBuf.fromBuf(2, this.buf.subarray(this.pos, this.pos + 2)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 2;
    return val;
  }

  readU32LE(): U32LE {
    let val: U32LE;
    try {
      val = U32LE.fromLEBuf(
        FixedBuf.fromBuf(4, this.buf.subarray(this.pos, this.pos + 4)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 4;
    return val;
  }

  readU64LE(): U64LE {
    let val: U64LE;
    try {
      val = U64LE.fromLEBuf(
        FixedBuf.fromBuf(8, this.buf.subarray(this.pos, this.pos + 8)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 8;
    return val;
  }

  readU128LE(): U128LE {
    let val: U128LE;
    try {
      val = U128LE.fromLEBuf(
        FixedBuf.fromBuf(16, this.buf.subarray(this.pos, this.pos + 16)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 16;
    return val;
  }

  readU256LE(): U256LE {
    let val: U256LE;
    try {
      val = U256LE.fromLEBuf(
        FixedBuf.fromBuf(32, this.buf.subarray(this.pos, this.pos + 32)),
      );
    } catch {
      throw new Error("not enough bytes in the buffer to read");
    }
    this.pos += 32;
    return val;
  }

  readVarIntBEBuf(): WebBuf {
    const first = this.readU8().n;
    if (first === 0xfd) {
      const n = this.readU16BE();
      if (n.n < 0xfd) {
        throw new Error("non-minimal encoding");
      }
      return WebBuf.concat([WebBuf.from([first]), n.toBEBuf().buf]);
    }
    if (first === 0xfe) {
      const n = this.readU32BE();
      if (n.n < 0x10000) {
        throw new Error("non-minimal encoding");
      }
      return WebBuf.concat([WebBuf.from([first]), n.toBEBuf().buf]);
    }
    if (first === 0xff) {
      const n = this.readU64BE();
      if (n.bn < 0x100000000n) {
        throw new Error("non-minimal encoding");
      }
      return WebBuf.concat([WebBuf.from([first]), n.toBEBuf().buf]);
    }
    return WebBuf.from([first]);
  }

  /** Bitcoin/BCH CompactSize, not LEB128. Commit position only on success. */
  private readCompactSizeLE(): { value: bigint; bytes: WebBuf; next: number } {
    if (!(this.buf instanceof WebBuf)) throw new TypeError("Expected WebBuf");
    Uint8Array.prototype.values.call(this.buf.bytes);
    const start = this.pos;
    if (!Number.isSafeInteger(start) || start < 0 || start >= this.buf.length)
      throw new RangeError("Invalid CompactSize position");
    const prefix = this.buf.bytes[start];
    if (prefix === undefined)
      throw new RangeError("Missing CompactSize prefix");
    const width =
      prefix < 253 ? 0 : prefix === 253 ? 2 : prefix === 254 ? 4 : 8;
    const next = start + 1 + width;
    if (next > this.buf.length) throw new RangeError("Truncated CompactSize");
    let value = width === 0 ? BigInt(prefix) : 0n;
    for (let i = width; i > 0; i--) {
      const byte = this.buf.bytes[start + i];
      if (byte === undefined) throw new RangeError("Truncated CompactSize");
      value = (value << 8n) | BigInt(byte);
    }
    if (
      (width === 2 && value < 253n) ||
      (width === 4 && value < 65536n) ||
      (width === 8 && value < 4294967296n)
    )
      throw new RangeError("Nonminimal CompactSize");
    return { value, bytes: this.buf.slice(start, next), next };
  }

  /** Return independent canonical LE CompactSize bytes. */
  readVarIntLEBuf(): WebBuf {
    const result = this.readCompactSizeLE();
    this.pos = result.next;
    return result.bytes;
  }

  /** Return the full unsigned 64-bit value in independent storage. */
  readVarIntU64LE(): U64LE {
    const result = this.readCompactSizeLE();
    const value = U64LE.fromBn(result.value);
    this.pos = result.next;
    return value;
  }

  readVarIntU64BE(): U64BE {
    const buf = this.readVarIntBEBuf();
    const bufReader = new BufReader(buf);
    const first = bufReader.readU8().n;
    let value: bigint;
    switch (first) {
      case 0xfd:
        value = bufReader.readU16BE().bn;
        break;
      case 0xfe:
        value = bufReader.readU32BE().bn;
        break;
      case 0xff:
        value = bufReader.readU64BE().bn;
        break;
      default:
        value = BigInt(first);
        break;
    }
    return U64BE.fromBn(value);
  }
}
