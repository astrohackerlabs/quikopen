import { describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { WebBuf } from "../src/index.js";

const decoders = [
  (text: string, stripWhitespace?: boolean): WebBuf =>
    WebBuf.fromBase64Url(text, stripWhitespace),
  (text: string, stripWhitespace?: boolean): WebBuf =>
    WebBuf.fromBase64UrlPureJs(text, stripWhitespace),
  (text: string, stripWhitespace?: boolean): WebBuf =>
    WebBuf.fromBase64UrlWasm(text, stripWhitespace),
];
const encoders = [
  "toBase64Url",
  "toBase64UrlPureJs",
  "toBase64UrlWasm",
] as const;
const malformed = [
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
  " Zg",
  "Zg\u00a0",
  "Zg\u2028",
  "Zg\u200b",
];
const vectors = [
  ["", "", ""],
  ["66", "Zg", "Zg=="],
  ["666f", "Zm8", "Zm8="],
  ["666f6f", "Zm9v", "Zm9v"],
  ["666f6f626172", "Zm9vYmFy", "Zm9vYmFy"],
  ["fbff", "-_8", "-_8="],
  ["ff", "_w", "_w=="],
];

describe("strict Base64url", () => {
  it("matches independent literals in all backends and selectors", () => {
    for (const [hex, plain, padded] of vectors as [string, string, string][]) {
      for (const encode of encoders) {
        expect(WebBuf.fromHex(hex)[encode]()).toBe(plain);
        expect(WebBuf.fromHex(hex)[encode](true)).toBe(padded);
        expect(WebBuf.fromHex(hex)[encode](undefined)).toBe(plain);
      }
      for (const text of [plain, padded]) {
        for (const decode of decoders) expect(decode(text).toHex()).toBe(hex);
        expect(WebBuf.from(text, "base64url").toHex()).toBe(hex);
        expect(WebBuf.fromString(text, "base64url").toHex()).toBe(hex);
      }
      expect(WebBuf.fromHex(hex).toString("base64url")).toBe(plain);
    }
  });

  it("agrees with Node for all bytes, UTF-8, chunk boundaries and 1 MiB", () => {
    const payloads = [
      new TextEncoder().encode("λ🌌\0"),
      ...[0, 1, 2, 3, 255, 256, 257, 12287, 12288, 12289, 1048576].map((n) =>
        Uint8Array.from({ length: n }, (_, i) => i % 256),
      ),
    ];
    for (const bytes of payloads) {
      const backing = new Uint8Array(bytes.length + 2);
      backing[0] = 0xaa;
      backing[backing.length - 1] = 0xbb;
      backing.set(bytes, 1);
      const selected = WebBuf.view(backing.subarray(1, -1));
      const expected = Buffer.from(bytes).toString("base64url");
      for (const encode of encoders) expect(selected[encode]()).toBe(expected);
      for (const decode of decoders)
        expect(
          Buffer.from(decode(expected).bytes).equals(Buffer.from(bytes)),
        ).toBe(true);
      expect(backing[0]).toBe(0xaa);
      expect(backing[backing.length - 1]).toBe(0xbb);
      expect(Buffer.from(selected.bytes).equals(Buffer.from(bytes))).toBe(true);
    }
  });

  it("rejects malformed text consistently without coercion", () => {
    const allDecoders = [
      ...decoders,
      (s: string): WebBuf => WebBuf.from(s, "base64url"),
      (s: string): WebBuf => WebBuf.fromString(s, "base64url"),
    ];
    for (const decode of allDecoders) {
      for (const text of malformed)
        expect(() => decode(text)).toThrow(TypeError);
      for (const input of [null, 7, {}, new String("Zg"), new Uint8Array()])
        expect(() => decode(input as unknown as string)).toThrow(TypeError);
    }
    for (const decode of decoders) {
      expect(decode(" \tZ\ng==\r\u00a0\u2028", true).toUtf8()).toBe("f");
      expect(decode(" \n", true).length).toBe(0);
      for (const text of ["Zh", "+w", "Zg=", "Zg\u200b"])
        expect(() => decode(text, true)).toThrow(TypeError);
      expect(decode("Zg", undefined).toUtf8()).toBe("f");
      for (const bad of [null, 0, "true", {}])
        expect(() => decode("Zg", bad as boolean)).toThrow(TypeError);
    }
    for (const encode of encoders)
      for (const bad of [null, 0, "true", {}])
        expect(() => WebBuf.alloc(0)[encode](bad as boolean)).toThrow(
          TypeError,
        );
  });

  it("gives each decode independent storage, including empty buffers", () => {
    for (const decode of decoders) {
      const a = decode("-_8"),
        b = decode("-_8");
      a.bytes[0] = 0;
      a.wipe();
      expect(b.toHex()).toBe("fbff");
      expect(a.buffer).not.toBe(b.buffer);
      expect(decode("").buffer).not.toBe(decode("").buffer);
    }
  });

  it("routes backend variants through their named Base64 primitives", () => {
    for (const [decode, primitive] of [
      ["fromBase64Url", "fromBase64"],
      ["fromBase64UrlPureJs", "fromBase64PureJs"],
      ["fromBase64UrlWasm", "fromBase64Wasm"],
    ] as const) {
      const spy = vi.spyOn(WebBuf, primitive);
      try {
        WebBuf[decode]("_w");
        expect(spy).toHaveBeenCalledWith("/w==");
      } finally {
        spy.mockRestore();
      }
    }
    for (const [encode, primitive] of [
      ["toBase64Url", "toBase64"],
      ["toBase64UrlPureJs", "toBase64PureJs"],
      ["toBase64UrlWasm", "toBase64Wasm"],
    ] as const) {
      const spy = vi.spyOn(WebBuf.prototype, primitive);
      try {
        WebBuf.fromHex("ff")[encode]();
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    }
  });
});
