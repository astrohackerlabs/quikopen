import { expect, test, expectTypeOf } from "vitest";
import { FixedBuf } from "../src/index.js";

test("strict fixed hex validates syntax before size and preserves literal types", () => {
  const buf = FixedBuf.fromStrictHex(32, "00".repeat(32));
  expectTypeOf(buf).toEqualTypeOf<FixedBuf<32>>();
  expectTypeOf(buf).not.toEqualTypeOf<FixedBuf<16>>();
  expect(FixedBuf.fromStrictHex(0, "").toHex()).toBe("");
  expect(FixedBuf.fromStrictHex(1, "ab").toHex()).toBe("ab");
  for (const text of ["", "abcd"])
    expect(() => FixedBuf.fromStrictHex(1, text)).toThrow("invalid size error");
  for (const text of ["g", "1g", "gggg", "AB"])
    expect(() => FixedBuf.fromStrictHex(1, text)).toThrow("Invalid hex string");
  const first = FixedBuf.fromStrictHex(1, "ab");
  const second = FixedBuf.fromStrictHex(1, "ab");
  first.buf.bytes[0] = 0;
  expect(second.toHex()).toBe("ab");
  expect(FixedBuf.fromHex(1, "1g").toHex()).toBe("01");
  expect(FixedBuf.fromHex(1, "zz").toHex()).toBe("00");
  expect(FixedBuf.fromHex(1, "AB").toHex()).toBe("ab");
  expect(() => FixedBuf.fromHex(1, "0")).toThrow("Invalid hex string");
  expect(() => FixedBuf.fromHex(500, "zz".repeat(500))).toThrow("invalid hex");
});
