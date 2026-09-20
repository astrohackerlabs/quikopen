import { expect, it } from "vitest";
import { FixedBuf } from "../src/index.js";
import { WebBuf } from "@webbuf/webbuf";

it("decodes with literal size inference, independent storage and strict errors", () => {
  const fixed: FixedBuf<2> = FixedBuf.fromBase64Url(2, "-_8=");
  expect(fixed.toBase64Url()).toBe("-_8");
  expect(fixed.toBase64Url(true)).toBe("-_8=");
  const other = FixedBuf.fromBase64Url(2, "-_8");
  fixed.wipe();
  expect(other.toHex()).toBe("fbff");
  expect(FixedBuf.fromBase64Url(0, "").toBase64Url()).toBe("");
  expect(FixedBuf.fromBase64Url(1, " Zg==\n", true).toHex()).toBe("66");
  for (const size of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1"])
    expect(() => FixedBuf.fromBase64Url(size as number, "")).toThrow(
      RangeError,
    );
  for (const size of [0, 2, 32])
    expect(() => FixedBuf.fromBase64Url(size, "Zg")).toThrow(RangeError);
  for (const text of [
    "A",
    "=",
    "Zg=",
    "Zg===",
    "Z=g=",
    "Zm9v=",
    "Zh",
    "Zh==",
    "Zm9",
    "Zm9=",
    "+w",
    "/w",
    "-_8/",
    "Zg!",
    "é",
    "Zg\n",
    null,
    {},
  ])
    expect(() => FixedBuf.fromBase64Url(1, text as string)).toThrow(TypeError);
  expect(() =>
    FixedBuf.fromBase64Url(1, "Zg", 1 as unknown as boolean),
  ).toThrow(TypeError);
  expect(() => other.toBase64Url(null as unknown as boolean)).toThrow(
    TypeError,
  );
});

it("encodes only a shared selection without modifying it", () => {
  const source = WebBuf.fromHex("aafbffbb");
  const selected = FixedBuf.fromBuf(2, source.subarray(1, 3));
  expect(selected.toBase64Url()).toBe("-_8");
  expect(source.toHex()).toBe("aafbffbb");
});
