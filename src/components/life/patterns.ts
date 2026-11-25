import { COLS, ROWS } from "./engine.ts";

export type Pattern = {
  id: string;
  name: string;
  /** Where to place the pattern in the viewport: 0.5 centers it. */
  anchorX: number;
  cells: readonly (readonly [number, number])[];
};

export function decodeRle(rle: string): [number, number][] {
  const cells: [number, number][] = [];
  let col = 0;
  let row = 0;
  let count = 0;
  const body = rle.replace(/\s+/g, "");
  for (const ch of body) {
    if (ch >= "0" && ch <= "9") {
      count = count * 10 + (ch.charCodeAt(0) - 48);
      continue;
    }
    const run = count || 1;
    count = 0;
    if (ch === "b") col += run;
    else if (ch === "o") {
      for (let i = 0; i < run; i++) cells.push([col++, row]);
    } else if (ch === "$") {
      row += run;
      col = 0;
    } else if (ch === "!") break;
  }
  return cells;
}

function fromAscii(rows: readonly string[]): [number, number][] {
  const cells: [number, number][] = [];
  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (line[col] === "O") cells.push([col, row]);
    }
  });
  return cells;
}

export const PATTERNS: readonly Pattern[] = [
  {
    id: "glider",
    name: "Glider",
    anchorX: 0.5,
    cells: fromAscii([".O.", "..O", "OOO"]),
  },
  {
    id: "gosper",
    name: "Gosper gun",
    anchorX: 0.3,
    cells: decodeRle(
      "24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!",
    ),
  },
  {
    id: "pulsar",
    name: "Pulsar",
    anchorX: 0.5,
    cells: fromAscii([
      "..OOO...OOO..",
      ".............",
      "O....O.O....O",
      "O....O.O....O",
      "O....O.O....O",
      "..OOO...OOO..",
      ".............",
      "..OOO...OOO..",
      "O....O.O....O",
      "O....O.O....O",
      "O....O.O....O",
      ".............",
      "..OOO...OOO..",
    ]),
  },
  {
    id: "lwss",
    name: "Spaceship",
    anchorX: 0.5,
    cells: fromAscii([".O..O", "O....", "O...O", "OOOO."]),
  },
  {
    id: "acorn",
    name: "Acorn",
    anchorX: 0.42,
    cells: fromAscii([".O.....", "...O...", "OO..OOO"]),
  },
  {
    id: "rpentomino",
    name: "R-pentomino",
    anchorX: 0.5,
    cells: fromAscii([".OO", "OO.", ".O."]),
  },
];

export function patternById(id: string): Pattern | undefined {
  return PATTERNS.find((pattern) => pattern.id === id);
}

export function placement(pattern: Pattern): { originCol: number; originRow: number; focusCol: number; focusRow: number } {
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -Infinity;
  let maxR = -Infinity;
  for (const [col, row] of pattern.cells) {
    if (col < minC) minC = col;
    if (row < minR) minR = row;
    if (col > maxC) maxC = col;
    if (row > maxR) maxR = row;
  }
  const width = maxC - minC + 1;
  const height = maxR - minR + 1;
  const leftBias = pattern.anchorX < 0.4;
  const originCol = (leftBias ? Math.floor(COLS * 0.04) : Math.floor((COLS - width) / 2)) - minC;
  const originRow = Math.floor((ROWS - height) / 2) - minR;
  return {
    originCol,
    originRow,
    focusCol: originCol + minC + width / 2,
    focusRow: originRow + minR + height / 2,
  };
}
