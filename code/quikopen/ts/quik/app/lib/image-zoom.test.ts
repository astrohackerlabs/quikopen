import { expect, test } from "bun:test";

import {
  nextZoom,
  zoomEdges,
  zoomLabel,
  zoomSize,
  ZOOM_DEFAULT,
} from "./image-zoom.ts";

test("zoom steps, ends, and labels", () => {
  expect(ZOOM_DEFAULT).toBe(100);
  expect(nextZoom(100, 1)).toBe(125);
  expect(nextZoom(125, -1)).toBe(100);
  expect(nextZoom(25, -1)).toBe(25);
  expect(nextZoom(400, 1)).toBe(400);
  expect(zoomEdges(25)).toEqual({ minus: true, plus: false });
  expect(zoomEdges(100)).toEqual({ minus: false, plus: false });
  expect(zoomEdges(400)).toEqual({ minus: false, plus: true });
  expect(zoomLabel(100)).toBe("100%");
  expect(zoomLabel(125)).toBe("125%");
  expect(zoomSize(32, 100)).toBe(32);
  expect(zoomSize(32, 125)).toBe(40);
  expect(zoomSize(32, 150)).toBe(48);
});
