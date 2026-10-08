/** Thumbnails (default), Grid, or one image at a time. */
export type ViewMode = "thumbs" | "grid" | "single";

/** Move `delta` images from `index`, wrapping at both ends. */
export function step(index: number, delta: number, count: number): number {
  if (count < 1) return 0;
  return (((index + delta) % count) + count) % count;
}

/**
 * The selection change for a key in a view, or null when the key does not
 * move the selection. Thumbnails accepts all four arrows; Single accepts
 * Left/Right; Grid accepts none.
 */
export function keyDelta(key: string, view: ViewMode): number | null {
  if (view === "grid") return null;
  if (key === "ArrowRight") return 1;
  if (key === "ArrowLeft") return -1;
  if (view !== "thumbs") return null;
  if (key === "ArrowDown") return 1;
  if (key === "ArrowUp") return -1;
  return null;
}
