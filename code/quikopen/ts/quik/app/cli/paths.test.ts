import * as assert from "node:assert/strict";
import { describe, it } from "bun:test";
import * as path from "node:path";

import { resolvePackageRoot } from "./paths.ts";

describe("resolvePackageRoot", () => {
  it("uses QUIK_PKG_ROOT override", () => {
    const root = path.resolve(import.meta.dir, "../..");
    assert.equal(resolvePackageRoot({ QUIK_PKG_ROOT: root }), root);
  });

  it("resolves from this module when env is empty", () => {
    const root = path.resolve(import.meta.dir, "../..");
    assert.equal(resolvePackageRoot({}), root);
  });
});
