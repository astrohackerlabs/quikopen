import { expect, test } from "bun:test";
import { WebBuf } from "@webbuf/webbuf";
import {
  peekSetOverlayUrl,
  buildSetOverlayFrame,
  setOverlayDefaults,
} from "./termsurf-encode.ts";

test("literal pre-migration SetOverlay wire bytes with UTF-8 and multibyte lengths", () => {
  const frame = buildSetOverlayFrame(
    setOverlayDefaults({
      paneId: "é",
      col: 300,
      row: 0,
      width: 80,
      height: 24,
      url: "x".repeat(128),
    }),
  );
  expect(frame.toHex()).toBe(
    "a10000009a019d010a02c3a910ac02180020502818328001" +
      "78".repeat(128) +
      "3a0764656661756c7440014a00",
  );
});
test("exact safe uint64 encoding above 32 bits", () => {
  const frame = buildSetOverlayFrame(
    setOverlayDefaults({
      paneId: "p",
      col: 4294967296,
      row: 0,
      width: 1,
      height: 1,
      url: "u",
    }),
  );
  expect(frame.toHex()).toBe(
    "220000009a011f0a01701080808080101800200128013201753a0764656661756c7440014a00",
  );
});

test("rejects invalid numeric inputs instead of modulo coercion", () => {
  for (const col of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
      buildSetOverlayFrame(
        setOverlayDefaults({
          paneId: "p",
          col,
          row: 0,
          width: 1,
          height: 1,
          url: "u",
        }),
      ),
    ).toThrow(RangeError);
  }
});

test("nullable peeker rejects malformed wire data", () => {
  for (const hex of [
    "0100000080", // unterminated tag
    "030000009a0180", // unterminated length
    "030000009a0105", // length exceeds remaining bytes
    "050000009a01023280", // inner truncated length
    "090000009a0106328080808010", // u32 length overflow
    "050000009a0101", // truncated frame
    "0100000000", // invalid zero tag
  ])
    expect(peekSetOverlayUrl(WebBuf.fromHex(hex))).toBeNull();
});

test("accepts bounded padded varints", () => {
  expect(
    peekSetOverlayUrl(WebBuf.fromHex("0a0000009a8100860032810075")),
  ).toBeNull();
  // Padded outer tag and outer length, then a one-byte URL.
  expect(peekSetOverlayUrl(WebBuf.fromHex("080000009a81008300320175"))).toBe(
    "u",
  );
});
