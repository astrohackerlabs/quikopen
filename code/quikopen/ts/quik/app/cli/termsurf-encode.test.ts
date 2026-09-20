import * as assert from "node:assert/strict";
import { describe, it } from "bun:test";

import {
  buildSetOverlayFrame,
  peekSetOverlayUrl,
  setOverlayDefaults,
} from "./termsurf-encode.ts";

describe("termsurf SetOverlay framing", () => {
  it("uses ahweb defaults for profile and empty browser", () => {
    const f = setOverlayDefaults({
      paneId: "pane-1",
      col: 0,
      row: 0,
      width: 80,
      height: 24,
      url: "http://127.0.0.1:9/",
    });
    assert.equal(f.profile, "default");
    assert.equal(f.browser, "");
    assert.equal(f.browsing, true);
  });

  it("frames length-prefixed payload with URL intact", () => {
    const url = "http://127.0.0.1:4242/?client=abc&token=def";
    const frame = buildSetOverlayFrame(
      setOverlayDefaults({
        paneId: "p1",
        col: 0,
        row: 0,
        width: 100,
        height: 40,
        url,
      }),
    );
    assert.ok(frame.length > 8);
    const len = new DataView(frame.buffer, frame.byteOffset, 4).getUint32(
      0,
      true,
    );
    assert.equal(len, frame.length - 4);
    assert.equal(peekSetOverlayUrl(frame), url);
  });

  it("does not use reserved OpenApp field numbers (40-42)", () => {
    // Structural: our encoder only emits field 19 for set_overlay at top level
    const frame = buildSetOverlayFrame(
      setOverlayDefaults({
        paneId: "p",
        col: 0,
        row: 0,
        width: 10,
        height: 10,
        url: "http://127.0.0.1:1/",
      }),
    );
    const payload = frame.subarray(4);
    // first tag should be field 19 wire type 2 => (19<<3)|2 = 154
    assert.equal(payload.bytes[0], 154);
  });
});
