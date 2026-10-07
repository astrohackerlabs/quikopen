import { expect, test } from "vitest";
import { WebBuf } from "../src/index.js";

test("strict hex validates the whole lowercase byte string", () => {
  for (const text of ["", "00", "0001", "abcdef"]) {
    expect(WebBuf.fromStrictHex(text).toHex()).toBe(text);
  }
  for (const text of [
    "1g",
    "g1",
    "zz",
    "0",
    "AB",
    "aB",
    "0x01",
    "+1",
    "-1",
    " 0",
    "0 ",
    "\t0",
    "0\n",
    "00\r\n",
    "\ufeff0",
    "\u00850",
    "０１",
    "é",
  ]) {
    expect(() => WebBuf.fromStrictHex(text)).toThrow("Invalid hex string");
  }
  const all = Array.from({ length: 256 }, (_, i) =>
    i.toString(16).padStart(2, "0"),
  ).join("");
  expect(Array.from(WebBuf.fromStrictHex(all).bytes)).toEqual(
    Array.from({ length: 256 }, (_, i) => i),
  );
  for (const length of [998, 999, 1000, 1001, 1002, 20000]) {
    const text = "a".repeat(length);
    if (length % 2 === 0) expect(WebBuf.fromStrictHex(text).toHex()).toBe(text);
    else expect(() => WebBuf.fromStrictHex(text)).toThrow("Invalid hex string");
    for (const pos of [0, Math.floor(length / 2), length - 1]) {
      expect(() =>
        WebBuf.fromStrictHex(text.slice(0, pos) + "g" + text.slice(pos + 1)),
      ).toThrow("Invalid hex string");
    }
  }
  const first = WebBuf.fromStrictHex("ab");
  const second = WebBuf.fromStrictHex("ab");
  first.bytes[0] = 0;
  expect(second.toHex()).toBe("ab");
});

test("existing permissive hex APIs retain their behavior", () => {
  for (const decode of [
    (text: string): WebBuf => WebBuf.fromHex(text),
    (text: string): WebBuf => WebBuf.from(text, "hex"),
  ]) {
    expect(decode("1g").toHex()).toBe("01");
    expect(decode("zz").toHex()).toBe("00");
    expect(decode("AB").toHex()).toBe("ab");
    expect(() => decode("0")).toThrow("Invalid hex string");
    expect(() => decode("zz".repeat(500))).toThrow("invalid hex");
  }
  expect(WebBuf.fromHexPureJs("1g").toHex()).toBe("01");
  expect(WebBuf.fromHexWasm("AB").toHex()).toBe("ab");
  expect(() => WebBuf.fromHexWasm("1g")).toThrow("invalid hex");
});
