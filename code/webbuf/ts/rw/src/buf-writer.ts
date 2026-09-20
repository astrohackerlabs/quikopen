import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import { encodeLEB128 } from "./leb128.js";
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

export class BufWriter {
  bufs: WebBuf[];

  constructor(bufs?: WebBuf[]) {
    this.bufs = bufs ? bufs.map((arr) => WebBuf.from(arr)) : [];
  }

  getLength(): number {
    let len = 0;
    for (const buf of this.bufs) {
      len += buf.length;
    }
    return len;
  }

  toBuf(): WebBuf {
    return WebBuf.concat(this.bufs);
  }

  write(buf: WebBuf): this {
    this.bufs.push(buf);
    return this;
  }

  /** Append minimal unsigned LEB128; validate before changing writer state. */
  writeULEB128(value: bigint, maxBits = 64): this {
    return this.write(encodeLEB128(value, maxBits, false));
  }

  /** Append minimal signed LEB128 (not protobuf ZigZag). */
  writeSLEB128(value: bigint, maxBits = 64): this {
    return this.write(encodeLEB128(value, maxBits, true));
  }

  writeU8(u8: U8): this {
    this.write(u8.toBEBuf().buf);
    return this;
  }

  writeU16BE(u16: U16BE): this {
    this.write(u16.toBEBuf().buf);
    return this;
  }

  writeU32BE(u32: U32BE): this {
    this.write(u32.toBEBuf().buf);
    return this;
  }

  writeU64BE(u64: U64BE): this {
    this.write(u64.toBEBuf().buf);
    return this;
  }

  writeU128BE(u128: U128BE): this {
    this.write(u128.toBEBuf().buf);
    return this;
  }

  writeU256BE(u256: U256BE): this {
    this.write(u256.toBEBuf().buf);
    return this;
  }

  writeU16LE(value: U16LE): this {
    this.write(value.toLEBuf().buf);
    return this;
  }

  writeU32LE(value: U32LE): this {
    this.write(value.toLEBuf().buf);
    return this;
  }

  writeU64LE(value: U64LE): this {
    this.write(value.toLEBuf().buf);
    return this;
  }

  writeU128LE(value: U128LE): this {
    this.write(value.toLEBuf().buf);
    return this;
  }

  writeU256LE(value: U256LE): this {
    this.write(value.toLEBuf().buf);
    return this;
  }

  writeVarIntU64BE(u64: U64BE): this {
    const buf = BufWriter.varIntU64BEBuf(u64);
    this.write(buf);
    return this;
  }

  /** Append Bitcoin/BCH CompactSize, snapshotting before changing state. */
  writeVarIntU64LE(value: U64LE): this {
    return this.write(BufWriter.varIntU64LEBuf(value));
  }

  /** Minimal LE CompactSize over the full U64 domain; not LEB128. */
  static varIntU64LEBuf(value: U64LE): WebBuf {
    if (
      !(value instanceof U64LE) ||
      !(value.buf instanceof FixedBuf) ||
      !(value.buf.buf instanceof WebBuf)
    )
      throw new TypeError("Expected U64LE");
    Uint8Array.prototype.values.call(value.buf.buf.bytes);
    if (value.buf.buf.length !== 8)
      throw new TypeError("Invalid U64LE storage");
    const n = value.bn;
    if (n < 253n) return WebBuf.from([Number(n)]);
    const width = n <= 65535n ? 2 : n <= 4294967295n ? 4 : 8;
    const result = WebBuf.alloc(width + 1);
    result.bytes[0] = width === 2 ? 253 : width === 4 ? 254 : 255;
    let remaining = n;
    for (let i = 1; i <= width; i++) {
      result.bytes[i] = Number(remaining & 255n);
      remaining >>= 8n;
    }
    return result;
  }

  static varIntU64BEBuf(bn: U64BE): WebBuf {
    let buf: WebBuf;
    const n = bn.n;
    if (n < 253) {
      buf = WebBuf.alloc(1);
      buf.write(U8.fromN(n).toBEBuf().buf, 0);
    } else if (n < 0x10000) {
      buf = WebBuf.alloc(1 + 2);
      buf.write(U8.fromN(253).toBEBuf().buf, 0);
      buf.write(U16BE.fromN(n).toBEBuf().buf, 1);
    } else if (n < 0x100000000) {
      buf = WebBuf.alloc(1 + 4);
      buf.write(U8.fromN(254).toBEBuf().buf, 0);
      buf.write(U32BE.fromN(n).toBEBuf().buf, 1);
    } else {
      buf = WebBuf.alloc(1 + 8);
      buf.write(U8.fromN(255).toBEBuf().buf, 0);
      buf.write(bn.toBEBuf().buf, 1);
    }
    return buf;
  }
}
