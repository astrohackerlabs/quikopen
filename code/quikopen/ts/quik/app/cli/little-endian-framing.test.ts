import { describe, expect, test } from "bun:test";
import { WebBuf } from "@webbuf/webbuf";
import {
  frameTermSurfMessage,
  peekSetOverlayUrl,
  buildSetOverlayFrame,
  setOverlayDefaults,
} from "./termsurf-encode.ts";

describe("little-endian frame byte parity", () => {
  for (const size of [0, 1, 255, 256, 65535, 65536]) {
    test(`preserves every byte for a ${String(size)}-byte payload`, () => {
      const payload = WebBuf.fromArray(
        Array.from({ length: size }, (_, i) => i % 251),
      );
      const frame = frameTermSurfMessage(payload);
      const expected = new Uint8Array(4 + size);
      // Independent native oracle, never the WebBuf method under test.
      new DataView(expected.buffer).setUint32(0, size, true);
      expected.set(payload.bytes, 4);
      expect(frame.bytes).toEqual(expected);
    });
  }
  test("preserves the real overlay payload and short-frame guard", () => {
    const url = "http://127.0.0.1:4242/plots/1";
    const frame = buildSetOverlayFrame(
      setOverlayDefaults({
        paneId: "p1",
        col: 1,
        row: 2,
        width: 80,
        height: 24,
        url,
      }),
    );
    expect(
      new DataView(frame.bytes.buffer, frame.bytes.byteOffset, 4).getUint32(
        0,
        true,
      ),
    ).toBe(frame.length - 4);
    expect(peekSetOverlayUrl(frame)).toBe(url);
    for (let size = 0; size < 5; size++) {
      expect(peekSetOverlayUrl(frame.subarray(0, size))).toBeNull();
    }
  });
});
