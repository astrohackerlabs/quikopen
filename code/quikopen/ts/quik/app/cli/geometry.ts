/** Full-pane overlay geometry in terminal cells. */

export interface PaneGeometry {
  col: number;
  row: number;
  width: number;
  height: number;
}

export function fullPaneGeometry(columns: number, rows: number): PaneGeometry {
  const width = Math.max(1, Math.floor(columns) || 80);
  const height = Math.max(1, Math.floor(rows) || 24);
  return { col: 0, row: 0, width, height };
}

/** Read geometry from process stdout or env overrides (tests). */
export function readTerminalGeometry(
  env: NodeJS.ProcessEnv = process.env,
  stdout: { columns?: number; rows?: number } = process.stdout,
): PaneGeometry {
  if (env.QUIK_COLS && env.QUIK_ROWS) {
    return fullPaneGeometry(Number(env.QUIK_COLS), Number(env.QUIK_ROWS));
  }
  const columns = stdout.columns ?? 80;
  const rows = stdout.rows ?? 24;
  return fullPaneGeometry(columns, rows);
}
