export const COLS = 200;
export const ROWS = 120;

export type Grid = Uint8Array;

export function createGrid(): Grid {
  return new Uint8Array(COLS * ROWS);
}

export function index(col: number, row: number): number {
  return row * COLS + col;
}

/** Advance one generation into `dst`. Returns the live-cell count. */
export function step(src: Grid, dst: Grid, wrap: boolean): number {
  let population = 0;
  for (let row = 0; row < ROWS; row++) {
    const rowBase = row * COLS;
    for (let col = 0; col < COLS; col++) {
      let neighbors = 0;
      for (let dr = -1; dr <= 1; dr++) {
        let rr = row + dr;
        if (wrap) rr = (rr + ROWS) % ROWS;
        else if (rr < 0 || rr >= ROWS) continue;
        const base = rr * COLS;
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          let cc = col + dc;
          if (wrap) cc = (cc + COLS) % COLS;
          else if (cc < 0 || cc >= COLS) continue;
          neighbors += src[base + cc]!;
        }
      }
      const alive = src[rowBase + col]!;
      const next = alive ? (neighbors === 2 || neighbors === 3 ? 1 : 0) : neighbors === 3 ? 1 : 0;
      dst[rowBase + col] = next;
      population += next;
    }
  }
  return population;
}

export function count(grid: Grid): number {
  let n = 0;
  for (let i = 0; i < grid.length; i++) n += grid[i]!;
  return n;
}

export function clear(grid: Grid): void {
  grid.fill(0);
}

export function stamp(
  grid: Grid,
  cells: readonly (readonly [number, number])[],
  originCol: number,
  originRow: number,
): number {
  grid.fill(0);
  let population = 0;
  for (const [col, row] of cells) {
    const c = originCol + col;
    const r = originRow + row;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
    const i = r * COLS + c;
    if (!grid[i]) {
      grid[i] = 1;
      population++;
    }
  }
  return population;
}

export function randomFill(grid: Grid, density: number): number {
  let population = 0;
  for (let i = 0; i < grid.length; i++) {
    const alive = Math.random() < density ? 1 : 0;
    grid[i] = alive;
    population += alive;
  }
  return population;
}

export function liveIndices(grid: Grid): number[] {
  const out: number[] = [];
  for (let i = 0; i < grid.length; i++) if (grid[i]) out.push(i);
  return out;
}

export function applyIndices(grid: Grid, indices: readonly number[]): number {
  grid.fill(0);
  let population = 0;
  for (const i of indices) {
    if (i >= 0 && i < grid.length && !grid[i]) {
      grid[i] = 1;
      population++;
    }
  }
  return population;
}

export function bounds(grid: Grid): { minC: number; maxC: number; minR: number; maxR: number } | null {
  let minC = COLS;
  let minR = ROWS;
  let maxC = -1;
  let maxR = -1;
  for (let row = 0; row < ROWS; row++) {
    const base = row * COLS;
    for (let col = 0; col < COLS; col++) {
      if (!grid[base + col]) continue;
      if (col < minC) minC = col;
      if (col > maxC) maxC = col;
      if (row < minR) minR = row;
      if (row > maxR) maxR = row;
    }
  }
  if (maxC < 0) return null;
  return { minC, maxC, minR, maxR };
}

/** Bresenham. Visits every cell from (c0,r0) through (c1,r1), inclusive. */
export function lineCells(
  c0: number,
  r0: number,
  c1: number,
  r1: number,
  visit: (col: number, row: number) => void,
): void {
  let col = c0;
  let row = r0;
  const dc = Math.abs(c1 - c0);
  const dr = Math.abs(r1 - r0);
  const stepC = c0 < c1 ? 1 : -1;
  const stepR = r0 < r1 ? 1 : -1;
  let err = dc - dr;
  for (;;) {
    visit(col, row);
    if (col === c1 && row === r1) break;
    const doubled = err * 2;
    if (doubled > -dr) {
      err -= dr;
      col += stepC;
    }
    if (doubled < dc) {
      err += dc;
      row += stepR;
    }
  }
}
