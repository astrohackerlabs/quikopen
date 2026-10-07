import { expect, test } from "bun:test";

import {
  nextZoom,
  zoomEdges,
  zoomLabel,
  zoomSize,
  ZOOM_DEFAULT,
  ZOOM_FIT,
} from "./image-zoom.ts";

test("zoom steps, ends, and labels", () => {
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

test("Fit is the default and steps from natural size", () => {
  expect(ZOOM_DEFAULT).toBe(ZOOM_FIT);
  expect(zoomLabel(ZOOM_FIT)).toBe("Fit");
  expect(zoomEdges(ZOOM_FIT)).toEqual({ minus: false, plus: false });
  expect(nextZoom(ZOOM_FIT, -1)).toBe(75);
  expect(nextZoom(ZOOM_FIT, 1)).toBe(125);
});
