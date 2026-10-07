/**
 * Toolbar zoom. `fit` (the default) shrinks each image to its box and never
 * enlarges it; percentages are relative to the natural pixel size.
 */
export const ZOOM_MIN = 25;
export const ZOOM_MAX = 400;
export const ZOOM_STEP = 25;
export const ZOOM_NATURAL = 100;
export const ZOOM_FIT = "fit";

export type Zoom = number | typeof ZOOM_FIT;

export const ZOOM_DEFAULT: Zoom = ZOOM_FIT;

export function zoomLabel(zoom: Zoom): string {
  return zoom === ZOOM_FIT ? "Fit" : `${String(zoom)}%`;
}

/** Steps from Fit start at natural size: Fit has no one scale across images. */
export function nextZoom(zoom: Zoom, direction: -1 | 1): number {
  const from = zoom === ZOOM_FIT ? ZOOM_NATURAL : zoom;
  const next = from + direction * ZOOM_STEP;
  if (next < ZOOM_MIN) return ZOOM_MIN;
  if (next > ZOOM_MAX) return ZOOM_MAX;
  return next;
}

export function zoomEdges(zoom: Zoom): { minus: boolean; plus: boolean } {
  if (zoom === ZOOM_FIT) return { minus: false, plus: false };
  return { minus: zoom <= ZOOM_MIN, plus: zoom >= ZOOM_MAX };
}

export function zoomSize(natural: number, percent: number): number {
  return Math.round((natural * percent) / 100);
}
