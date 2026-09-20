import { expect, it } from "vitest";
import { zigZagEncode, zigZagDecode } from "../src/index.js";

it("matches independent ZigZag vectors", () => {
  for (const [signed, unsigned] of [
    [0n, 0n],
    [-1n, 1n],
    [1n, 2n],
    [-2n, 3n],
    [2n, 4n],
    [-2147483648n, 4294967295n],
    [2147483647n, 4294967294n],
    [-9223372036854775808n, 18446744073709551615n],
    [9223372036854775807n, 18446744073709551614n],
  ] as const) {
    expect(zigZagEncode(signed)).toBe(unsigned);
    expect(zigZagDecode(unsigned)).toBe(signed);
  }
});

it("preserves arbitrary precision beyond fixed integer widths", () => {
  for (const n of [1n << 127n, -(1n << 255n), (1n << 1024n) + 1n]) {
    expect(zigZagDecode(zigZagEncode(n))).toBe(n);
  }
});

it("rejects invalid inputs without coercion", () => {
  expect(() => zigZagDecode(-1n)).toThrow(RangeError);
  for (const value of [0, NaN, "1", null, undefined, {}]) {
    expect(() => zigZagEncode(value as bigint)).toThrow(TypeError);
    expect(() => zigZagDecode(value as bigint)).toThrow(TypeError);
  }
});
