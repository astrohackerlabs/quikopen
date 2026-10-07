/** Grid columns and rows for one to nine images; never more than 3×3. */
export function gridShape(count: number): { cols: number; rows: number } {
  const n = Math.min(Math.max(Math.trunc(count), 1), 9);
  const cols = n === 4 ? 2 : Math.min(n, 3);
  return { cols, rows: Math.ceil(n / cols) };
}
