import { expect, test } from "bun:test";

import { gridShape } from "./image-grid.ts";

test("grid shapes for one to nine images stay within 3×3", () => {
  const shapes = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
    const { cols, rows } = gridShape(n);
    return `${String(cols)}x${String(rows)}`;
  });
  expect(shapes).toEqual([
    "1x1",
    "2x1",
    "3x1",
    "2x2",
    "3x2",
    "3x2",
    "3x3",
    "3x3",
    "3x3",
  ]);
  expect(gridShape(0)).toEqual({ cols: 1, rows: 1 });
  expect(gridShape(12)).toEqual({ cols: 3, rows: 3 });
});
