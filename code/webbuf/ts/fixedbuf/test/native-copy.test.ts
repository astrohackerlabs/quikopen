import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "../src/fixedbuf.js";

describe("fromUint8Array", () => {
  it.each([0, 1, 32, 49856])("copies exactly %i bytes", (size) => {
    const bytes = new Uint8Array(size).fill(0x7b);
    const fixed = FixedBuf.fromUint8Array(size, bytes);
    expect(fixed._size).toBe(size);
    expect(fixed.buf.bytes).toEqual(bytes);
    expect(fixed.buf.buffer).not.toBe(bytes.buffer);
  });

  it.each([3, 5])("rejects a %i-byte input for size 4", (size) => {
    expect(() => FixedBuf.fromUint8Array(4, new Uint8Array(size))).toThrow(
      "invalid size error",
    );
  });

  it("copies selected bytes and isolates mutations and wiping in both directions", () => {
    const source = new Uint8Array([0xaa, 1, 2, 3, 0xbb]);
    const fixed = FixedBuf.fromUint8Array(3, source.subarray(1, 4));
    expect(fixed.toHex()).toBe("010203");
    source[1] = 9;
    expect(fixed.toHex()).toBe("010203");
    fixed.buf.bytes[1] = 8;
    expect([...source]).toEqual([0xaa, 9, 2, 3, 0xbb]);
    fixed.wipe();
    expect(fixed.toHex()).toBe("000000");
    expect([...source]).toEqual([0xaa, 9, 2, 3, 0xbb]);
  });

  it("copies a selected Node Buffer, not its backing allocation", () => {
    const source = Buffer.from([0xaa, 1, 2, 0xbb]);
    const fixed = FixedBuf.fromUint8Array(2, source.subarray(1, 3));
    source.fill(0);
    expect(fixed.toHex()).toBe("0102");
    expect(fixed.buf.buffer).not.toBe(source.buffer);
  });

  it("copies shared-memory bytes into independent ArrayBuffer storage", () => {
    const source = new Uint8Array(new SharedArrayBuffer(4));
    source.set([0xaa, 1, 2, 0xbb]);
    const fixed = FixedBuf.fromUint8Array(2, source.subarray(1, 3));
    expect(fixed.buf.buffer).toBeInstanceOf(ArrayBuffer);
    source[1] = 9;
    expect(fixed.toHex()).toBe("0102");
    fixed.wipe();
    expect([...source]).toEqual([0xaa, 9, 2, 0xbb]);
  });

  it("keeps fromBuf as a shared selected view", () => {
    const source = WebBuf.fromHex("aa0102bb");
    const view = source.subarray(1, 3);
    const fixed = FixedBuf.fromBuf(2, view);
    expect(fixed.buf).toBe(view);
    source.bytes[1] = 9;
    expect(fixed.toHex()).toBe("0902");
    fixed.wipe();
    expect(source.toHex()).toBe("aa0000bb");
  });
});
