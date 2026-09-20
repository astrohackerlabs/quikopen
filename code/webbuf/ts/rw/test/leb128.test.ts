import { describe, expect, it } from "vitest";
import { WebBuf } from "@webbuf/webbuf";
import { BufReader, BufWriter } from "../src/index.js";

const unsigned: [bigint, string][] = [
  [0n, "00"],
  [127n, "7f"],
  [128n, "8001"],
  [300n, "ac02"],
  [624485n, "e58e26"],
  [4294967296n, "8080808010"],
  [9007199254740993n, "8180808080808010"],
  [18446744073709551615n, "ffffffffffffffffff01"],
];
const signed: [bigint, string][] = [
  [0n, "00"],
  [-1n, "7f"],
  [63n, "3f"],
  [64n, "c000"],
  [-64n, "40"],
  [-65n, "bf7f"],
  [-624485n, "9bf159"],
  [9223372036854775807n, "ffffffffffffffffff00"],
  [-9223372036854775808n, "8080808080808080807f"],
];

describe("LEB128 family", () => {
  for (const [label, vectors, write, read] of [
    ["unsigned", unsigned, "writeULEB128", "readULEB128"],
    ["signed", signed, "writeSLEB128", "readSLEB128"],
  ] as const) {
    for (const [value, hex] of vectors) {
      it(`${label} literal ${value.toString()}`, () => {
        const writer = new BufWriter();
        expect(writer[write](value)).toBe(writer);
        expect(writer.toBuf().toHex()).toBe(hex);
        const reader = new BufReader(WebBuf.fromHex(`ee${hex}aa`));
        reader.pos = 1;
        expect(reader[read]()).toBe(value);
        expect(reader.pos).toBe(1 + hex.length / 2);
        expect(reader.read(1).toHex()).toBe("aa");
        expect(reader.buf.toHex()).toBe(`ee${hex}aa`);
      });
    }
    for (const bits of [1, 7, 8, 14, 16, 21, 32, 63, 64, 65, 128, 256]) {
      it(`${label} width ${bits.toString()}: extrema and range failures`, () => {
        const signedMode = label === "signed";
        const upper = (1n << BigInt(bits - (signedMode ? 1 : 0))) - 1n;
        const lower = signedMode ? -(1n << BigInt(bits - 1)) : 0n;
        for (const value of new Set([lower, upper, 0n])) {
          const writer = new BufWriter()[write](value, bits);
          const reader = new BufReader(writer.toBuf());
          expect(reader[read](bits)).toBe(value);
          expect(reader.eof()).toBe(true);
        }
        for (const value of [lower - 1n, upper + 1n]) {
          const writer = new BufWriter().write(WebBuf.fromHex("aabb"));
          const entries = [...writer.bufs];
          expect(() => writer[write](value, bits)).toThrow(RangeError);
          expect(writer.bufs).toEqual(entries);
          expect(writer.toBuf().toHex()).toBe("aabb");
          if (signedMode || value >= 0n) {
            const encoded = new BufWriter()[write](value, bits + 1).toBuf();
            const reader = new BufReader(encoded);
            expect(() => reader[read](bits)).toThrow(RangeError);
            expect(reader.pos).toBe(0);
          }
        }
      });
    }
    it(`${label} bad arguments are atomic`, () => {
      for (const width of [
        0,
        -1,
        1.5,
        NaN,
        Infinity,
        Number.MAX_SAFE_INTEGER + 1,
        "64" as unknown as number,
      ]) {
        const writer = new BufWriter().write(WebBuf.fromHex("aa"));
        expect(() => writer[write](0n, width)).toThrow(RangeError);
        expect(writer.getLength()).toBe(1);
        const reader = new BufReader(WebBuf.fromHex("ee00"));
        reader.pos = 1;
        expect(() => reader[read](width)).toThrow(RangeError);
        expect(reader.pos).toBe(1);
      }
      for (const value of [0, "0", null, undefined, {}]) {
        const writer = new BufWriter();
        expect(() => writer[write](value as bigint)).toThrow(TypeError);
        expect(writer.bufs).toEqual([]);
      }
      for (const pos of [
        -1,
        0.5,
        NaN,
        Infinity,
        2,
        Number.MAX_SAFE_INTEGER + 1,
      ]) {
        const reader = new BufReader(WebBuf.fromHex("00"));
        reader.pos = pos;
        expect(() => reader[read]()).toThrow(RangeError);
        expect(reader.pos).toBe(pos);
      }
    });
    it(`${label} rejects truncation and bounded continuation streams`, () => {
      for (const hex of [
        "",
        "80",
        "80808080808080808080",
        "80".repeat(10000),
      ]) {
        const reader = new BufReader(WebBuf.fromHex(`ee${hex}`));
        reader.pos = 1;
        expect(() => reader[read]()).toThrow(RangeError);
        expect(reader.pos).toBe(1);
      }
    });
    it(`${label} huge width does not allocate huge storage`, () => {
      const writer = new BufWriter()[write](0n, Number.MAX_SAFE_INTEGER);
      expect(writer.toBuf().toHex()).toBe("00");
      expect(new BufReader(writer.toBuf())[read](Number.MAX_SAFE_INTEGER)).toBe(
        0n,
      );
    });
  }

  it("accepts bounded padding, then writes minimally", () => {
    expect(new BufReader(WebBuf.fromHex("8000")).readULEB128(8)).toBe(0n);
    expect(new BufReader(WebBuf.fromHex("ff7f")).readSLEB128(8)).toBe(-1n);
    expect(new BufReader(WebBuf.fromHex("8000")).readSLEB128(8)).toBe(0n);
    expect(new BufWriter().writeULEB128(0n).toBuf().toHex()).toBe("00");
    expect(new BufWriter().writeSLEB128(-1n).toBuf().toHex()).toBe("7f");
  });
  it("rejects invalid final unused bits and excessive padding", () => {
    for (const [hex, method, width] of [
      ["8002", "readULEB128", 8],
      ["ff01", "readSLEB128", 8],
      ["807e", "readSLEB128", 8],
      ["8000", "readULEB128", 7],
      ["ff7f", "readSLEB128", 7],
      ["ffffffffffffffffff02", "readULEB128", 64],
    ] as const) {
      const reader = new BufReader(WebBuf.fromHex(hex));
      expect(() => reader[method](width)).toThrow(RangeError);
      expect(reader.pos).toBe(0);
    }
  });
  it("reads concatenated signed and unsigned values independently", () => {
    const reader = new BufReader(WebBuf.fromHex("ac027f8001"));
    expect(reader.readULEB128()).toBe(300n);
    expect(reader.readSLEB128()).toBe(-1n);
    expect(reader.readULEB128()).toBe(128n);
    expect(reader.eof()).toBe(true);
  });
});
