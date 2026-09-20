import { expect, it } from "vitest";
import { WebBuf } from "@webbuf/webbuf";
import {
  encodeSignedMagnitudeLE,
  encodeSignedMagnitudeBE,
  decodeSignedMagnitudeLE,
  decodeSignedMagnitudeBE,
} from "../dist/index.js";
import vectors from "./signed-magnitude-vectors.json";

for (const [name, encode, decode, le] of [
  ["LE", encodeSignedMagnitudeLE, decodeSignedMagnitudeLE, true],
  ["BE", encodeSignedMagnitudeBE, decodeSignedMagnitudeBE, false],
] as const) {
  it(name + " matches pinned Libauth numeric vectors", () => {
    for (const row of vectors) {
      const value = BigInt(row.value);
      const hex = row.hex || "00";
      const expected = le ? hex : WebBuf.fromHex(hex).toReverse().toHex();
      expect(encode(value).toHex()).toBe(expected);
      expect(decode(WebBuf.fromHex(expected))).toBe(value);
    }
  });
  it(name + " pads magnitude, preserves sign, rejects overflow", () => {
    expect(encode(-1n, 2).toHex()).toBe(le ? "0180" : "8001");
    for (const width of [1, 2, 4, 8, 16, 64]) {
      const limit = (1n << BigInt(width * 8 - 1)) - 1n;
      for (const n of [-limit, -1n, 0n, 1n, limit]) {
        const encoded = encode(n, width);
        expect(encoded.length).toBe(width);
        const bytes = [...encoded];
        if (le) bytes.reverse();
        const sign = (bytes[0] ?? 0) & 128;
        bytes[0] = (bytes[0] ?? 0) & 127;
        const value = bytes.reduce((acc, b) => acc * 256n + BigInt(b), 0n);
        expect(sign ? -value : value).toBe(n);
        expect(decode(encoded)).toBe(n);
      }
      expect(() => encode(limit + 1n, width)).toThrow(RangeError);
      expect(() => encode(-limit - 1n, width)).toThrow(RangeError);
    }
    expect(encode(0n, 0).length).toBe(0);
    expect(() => encode(1n, 0)).toThrow();
    expect(() => encode(-1n, 0)).toThrow();
  });
  it(
    name + " accepts padded/negative zero and selected views without mutation",
    () => {
      for (const hex of ["", "00", "80", le ? "0080" : "8000", "0000"])
        expect(decode(WebBuf.fromHex(hex))).toBe(0n);
      const backing = WebBuf.fromHex(le ? "ff010080ff" : "ff800001ff");
      const before = backing.toHex();
      expect(decode(backing.subarray(1, 4))).toBe(-1n);
      expect(backing.toHex()).toBe(before);
      const a = encode(-1n),
        b = encode(-1n);
      a.fill(0);
      expect(b.toHex()).toBe("81");
      expect(encode(0n, 0).buffer).not.toBe(encode(0n, 0).buffer);
    },
  );
  it(
    name + " validates kinds, widths and detached/out-of-bounds storage",
    () => {
      for (const value of [1, null, undefined, {}, "1", true])
        expect(() => encode(value as bigint)).toThrow(TypeError);
      for (const width of ["1", null, {}, 1n, true])
        expect(() => encode(0n, width as number)).toThrow(TypeError);
      for (const width of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
        expect(() => encode(0n, width)).toThrow(RangeError);
      for (const bytes of [null, undefined, {}, [], new Uint8Array()])
        expect(() => decode(bytes as WebBuf)).toThrow(TypeError);
      for (const length of [0, 2]) {
        const storage = new ArrayBuffer(length);
        const buf = new WebBuf(storage);
        structuredClone(storage, { transfer: [storage] });
        expect(() => decode(buf)).toThrow(TypeError);
      }
      const storage = Reflect.construct(ArrayBuffer, [
        8,
        { maxByteLength: 16 },
      ]) as ArrayBuffer & { resize(n: number): void };
      const selected = new WebBuf(storage, 4, 4);
      storage.resize(2);
      expect(() => decode(selected)).toThrow(TypeError);
    },
  );
}
