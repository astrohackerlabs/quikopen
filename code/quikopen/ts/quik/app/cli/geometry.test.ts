import * as assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { fullPaneGeometry, readTerminalGeometry } from "./geometry.ts";

describe("geometry", () => {
  it("full pane starts at 0,0", () => {
    assert.deepEqual(fullPaneGeometry(120, 40), {
      col: 0,
      row: 0,
      width: 120,
      height: 40,
    });
  });

  it("readTerminalGeometry respects env overrides", () => {
    assert.deepEqual(
      readTerminalGeometry({ QUIK_COLS: "100", QUIK_ROWS: "30" }, {}),
      { col: 0, row: 0, width: 100, height: 30 },
    );
  });
});
