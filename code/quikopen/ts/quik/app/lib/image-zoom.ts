/** Header zoom steps. 100 is the image's natural pixel size. */
export const ZOOM_MIN = 25;
export const ZOOM_MAX = 400;
export const ZOOM_STEP = 25;
export const ZOOM_DEFAULT = 100;

export function zoomLabel(percent: number): string {
  return `${String(percent)}%`;
}

export function nextZoom(percent: number, direction: -1 | 1): number {
  const next = percent + direction * ZOOM_STEP;
  if (next < ZOOM_MIN) return ZOOM_MIN;
  if (next > ZOOM_MAX) return ZOOM_MAX;
  return next;
}

export function zoomEdges(percent: number): { minus: boolean; plus: boolean } {
  return { minus: percent <= ZOOM_MIN, plus: percent >= ZOOM_MAX };
}

export function zoomSize(natural: number, percent: number): number {
  return Math.round((natural * percent) / 100);
}
