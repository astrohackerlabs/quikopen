import { describe, expect, test } from "bun:test";
import { WebBuf } from "@webbuf/webbuf";
import { peekSetOverlayUrl } from "./termsurf-encode.ts";
import { chunkToWebBuf } from "./tty-esc.ts";

const vectors = [
  { name: "ASCII", hex: "616263", text: "abc" },
  { name: "multibyte", hex: "cf80f09f8c8c", text: "π🌌" },
  { name: "malformed", hex: "61ff62", text: "a\ufffdb" },
  { name: "truncated", hex: "e282", text: "\ufffd" },
  { name: "BOM", hex: "efbbbf61", text: "a" },
  { name: "empty", hex: "", text: "" },
];

describe("domain UTF-8 decoding", () => {
  for (const { name, hex, text } of vectors) {
    test(name + " overlay text from an offset frame", () => {
      const bytes = Buffer.from(hex, "hex");
      // Native, literal protobuf field 19 containing string field 6.
      const payload = Uint8Array.from([
        0x9a,
        0x01,
        bytes.length + 2,
        0x32,
        bytes.length,
        ...bytes,
      ]);
      const backing = new Uint8Array(payload.length + 6);
      backing[0] = 0x99;
      backing[backing.length - 1] = 0x88;
      new DataView(backing.buffer).setUint32(1, payload.length, true);
      backing.set(payload, 5);
      const before = backing.slice();
      const frame = WebBuf.view(backing.subarray(1, backing.length - 1));
      expect(peekSetOverlayUrl(frame)).toBe(text);
      expect(backing).toEqual(before);
    });

    test(name + " selected native chunk", () => {
      const backing = Buffer.from("99" + hex + "88", "hex");
      const selected = backing.subarray(1, backing.length - 1);
      const domain = chunkToWebBuf(selected);
      expect(domain.toUtf8()).toBe(text);
      selected.fill(0);
      expect(domain.toUtf8()).toBe(text);
      expect(backing[0]).toBe(0x99);
      expect(backing[backing.length - 1]).toBe(0x88);
    });
  }
  test("keeps string input and per-chunk replacement behavior", () => {
    expect(chunkToWebBuf("π🌌").toUtf8()).toBe("π🌌");
    const first = chunkToWebBuf(Buffer.from([0xe2, 0x82])).toUtf8();
    const second = chunkToWebBuf(Buffer.from([0xac])).toUtf8();
    expect(first + second).toBe("\ufffd\ufffd");
  });
});
