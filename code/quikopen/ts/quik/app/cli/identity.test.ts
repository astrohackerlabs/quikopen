import * as assert from "node:assert/strict";
import { describe, it } from "bun:test";

import {
  buildQuikUrl,
  mintToken,
  parseTokenFromUrl,
  timingSafeEqualStr,
} from "./identity.ts";

describe("identity", () => {
  it("mints unique tokens", () => {
    const a = mintToken();
    const b = mintToken();
    assert.notEqual(a, b);
    assert.equal(a.length, 32);
  });

  it("round-trips token and name in the overlay URL", () => {
    const token = mintToken();
    const url = buildQuikUrl(3456, token, "sample.svg");
    assert.ok(url.startsWith("http://127.0.0.1:3456/"));
    assert.equal(parseTokenFromUrl(url), token);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("name"), "sample.svg");
    assert.equal(parsed.pathname, "/");
    assert.ok(!url.includes("/tmp"));
  });

  it("timingSafeEqualStr", () => {
    assert.equal(timingSafeEqualStr("abc", "abc"), true);
    assert.equal(timingSafeEqualStr("abc", "abd"), false);
    assert.equal(timingSafeEqualStr("ab", "abc"), false);
  });
});
