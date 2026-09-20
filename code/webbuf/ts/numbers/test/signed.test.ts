import { expect, it } from "vitest";
import { WebBuf } from "@webbuf/webbuf";
import {
  decodeSignedBE,
  decodeSignedLE,
  encodeSignedBE,
  encodeSignedLE,
} from "../src/index.js";

// Independent positional arithmetic reference, not the production shift algorithm.
function reference(bytes: number[], little: boolean): bigint {
  const ordered = little ? [...bytes].reverse() : bytes;
  const unsigned = ordered.reduce((n, b) => n * 256n + BigInt(b), 0n);
  return (ordered[0] ?? 0) >= 128
    ? unsigned - 256n ** BigInt(ordered.length)
    : unsigned;
}

for (const [name, encode, decode, little] of [
  ["BE", encodeSignedBE, decodeSignedBE, false],
  ["LE", encodeSignedLE, decodeSignedLE, true],
] as const) {
  it(name + " matches literal minimal encodings", () => {
    for (const [value, hex] of [
      [0n, "00"],
      [1n, "01"],
      [-1n, "ff"],
      [127n, "7f"],
      [128n, "0080"],
      [-127n, "81"],
      [-128n, "80"],
      [-129n, "ff7f"],
      [32767n, "7fff"],
      [32768n, "008000"],
      [-32768n, "8000"],
      [-32769n, "ff7fff"],
    ] as const) {
      const expected = little ? WebBuf.fromHex(hex).toReverse().toHex() : hex;
      expect(encode(value).toHex()).toBe(expected);
      expect(encode(value, undefined).toHex()).toBe(expected);
      expect(decode(WebBuf.fromHex(expected))).toBe(value);
      if (value !== 0n) {
        const out = encode(value);
        expect(
          decode(little ? out.subarray(0, out.length - 1) : out.subarray(1)),
        ).not.toBe(value);
      }
    }
  });

  it(name + " enforces exact signed widths and sign extension", () => {
    for (const width of [1, 2, 4, 8, 16, 32, 64]) {
      const half = 2n ** BigInt(width * 8 - 1);
      for (const value of [-half, -half + 1n, -1n, 0n, 1n, half - 1n]) {
        const out = encode(value, width);
        expect(out.length).toBe(width);
        expect(reference([...out], little)).toBe(value);
        expect(decode(out)).toBe(value);
        const minimal = encode(value);
        expect(reference([...minimal], little)).toBe(value);
        if (value !== 0n) {
          const shortened = little
            ? [...minimal].slice(0, -1)
            : [...minimal].slice(1);
          expect(reference(shortened, little)).not.toBe(value);
        }
        expect(encodeSignedLE(value, width).toHex()).toBe(
          encodeSignedBE(value, width).toReverse().toHex(),
        );
      }
      expect(() => encode(-half - 1n, width)).toThrow(RangeError);
      expect(() => encode(half, width)).toThrow(RangeError);
      expect(encode(-1n, width).toHex()).toBe("ff".repeat(width));
      expect(encode(0n, width).toHex()).toBe("00".repeat(width));
    }
    expect(encode(0n, 0).length).toBe(0);
    for (const n of [1n, -1n]) expect(() => encode(n, 0)).toThrow(RangeError);
  });

  it(name + " agrees with native signed 64-bit DataView", () => {
    for (const value of [
      -(1n << 63n),
      -12345678901234567n,
      -1n,
      0n,
      1n,
      12345678901234567n,
      (1n << 63n) - 1n,
    ]) {
      const native = new Uint8Array(8);
      new DataView(native.buffer).setBigInt64(0, value, little);
      expect([...encode(value, 8)]).toEqual([...native]);
      expect(decode(WebBuf.fromUint8Array(native))).toBe(
        new DataView(native.buffer).getBigInt64(0, little),
      );
    }
  });

  it(
    name +
      " accepts padded, empty and selected arbitrary bytes without mutation",
    () => {
      for (const bytes of [
        [],
        [0],
        [0, 0],
        [255, 255],
        [255, 128],
        [128, 255],
        ...Array.from({ length: 100 }, (_, seed) =>
          Array.from({ length: seed }, (_, i) => (seed * 31 + i * 73) % 256),
        ),
      ]) {
        const backing = WebBuf.fromArray([99, ...bytes, 88]);
        const selected = backing.subarray(1, backing.length - 1);
        const expected = reference(bytes, little);
        expect(decode(selected)).toBe(expected);
        expect([...backing]).toEqual([99, ...bytes, 88]);
        const encoded = encode(expected);
        expect(reference([...encoded], little)).toBe(expected);
        expect(encode(expected, bytes.length).length).toBe(bytes.length);
      }
    },
  );

  it(name + " validates kinds, numeric widths and invalid storage", () => {
    for (const wrong of [0, "1", null, undefined, {}, true]) {
      expect(() => encode(wrong as bigint)).toThrow(TypeError);
    }
    for (const wrong of ["1", 1n, null, {}, true]) {
      expect(() => encode(0n, wrong as number)).toThrow(TypeError);
    }
    for (const wrong of [
      -1,
      0.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => encode(0n, wrong)).toThrow(RangeError);
    }
    for (const wrong of [new Uint8Array(), "", null, undefined, {}, []]) {
      expect(() => decode(wrong as WebBuf)).toThrow(TypeError);
    }
    for (const length of [0, 2]) {
      const storage = new ArrayBuffer(length);
      const buf = new WebBuf(storage);
      structuredClone(storage, { transfer: [storage] });
      expect(() => decode(buf)).toThrow(TypeError);
    }
    const storage = Reflect.construct(ArrayBuffer, [
      8,
      { maxByteLength: 16 },
    ]) as ArrayBuffer & {
      resizable: boolean;
      resize(n: number): void;
    };
    expect(storage.resizable).toBe(true);
    const selected = new WebBuf(storage, 4, 4);
    storage.resize(2);
    expect(() => decode(selected)).toThrow(TypeError);
    storage.resize(8);
    expect(decode(selected)).toBe(0n);
  });

  it(name + " returns independent results including empty and zero", () => {
    for (const [value, width] of [
      [0n, 0],
      [0n, 1],
      [-129n, 4],
    ] as const) {
      const first = encode(value, width),
        second = encode(value, width);
      expect(first.buffer).not.toBe(second.buffer);
      first.fill(42);
      expect(reference([...second], little)).toBe(value);
    }
  });
}
