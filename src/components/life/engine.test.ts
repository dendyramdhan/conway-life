import assert from "node:assert/strict";
import { test } from "node:test";
import { COLS, createGrid, index, lineCells, step, stamp } from "./engine.ts";
import { decodeRle, patternById } from "./patterns.ts";

test("blinker oscillates", () => {
  const src = createGrid();
  const dst = createGrid();
  src[index(10, 10)] = 1;
  src[index(11, 10)] = 1;
  src[index(12, 10)] = 1;
  const pop = step(src, dst, false);
  assert.equal(pop, 3);
  assert.equal(dst[index(11, 9)], 1);
  assert.equal(dst[index(11, 10)], 1);
  assert.equal(dst[index(11, 11)], 1);
  assert.equal(dst[index(10, 10)], 0);
  assert.equal(dst[index(12, 10)], 0);
});

test("glider translates after four generations", () => {
  const pattern = patternById("glider");
  assert.ok(pattern);
  const a = createGrid();
  const b = createGrid();
  stamp(a, pattern.cells, 20, 20);
  let src = a;
  let dst = b;
  for (let i = 0; i < 4; i++) {
    step(src, dst, false);
    const swap = src;
    src = dst;
    dst = swap;
  }
  for (const [col, row] of pattern.cells) {
    assert.equal(src[index(20 + col + 1, 20 + row + 1)], 1, `missing ${col + 1},${row + 1}`);
  }
  assert.equal(
    [...src].reduce((sum, cell) => sum + cell, 0),
    pattern.cells.length,
  );
});

test("gosper gun decodes to 36 cells", () => {
  const gun = patternById("gosper");
  assert.ok(gun);
  assert.equal(gun.cells.length, 36);
  assert.deepEqual(decodeRle("24bo!"), [[24, 0]]);
  assert.deepEqual(decodeRle("b2o$2o!"), [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ]);
});

test("edges do not wrap unless asked", () => {
  const src = createGrid();
  const wrapped = createGrid();
  const bounded = createGrid();
  src[index(COLS - 1, 10)] = 1;
  src[index(0, 10)] = 1;
  src[index(1, 10)] = 1;

  const boundedPop = step(src, bounded, false);
  assert.equal(boundedPop, 0);

  step(src, wrapped, true);
  assert.equal(wrapped[index(0, 9)], 1);
  assert.equal(wrapped[index(0, 10)], 1);
  assert.equal(wrapped[index(0, 11)], 1);
  assert.equal(wrapped[index(COLS - 1, 10)], 0);
  assert.equal(wrapped[index(1, 10)], 0);
});

test("paint strokes do not skip cells", () => {
  const seen: string[] = [];
  lineCells(0, 0, 4, 2, (col, row) => seen.push(`${col},${row}`));
  assert.equal(seen[0], "0,0");
  assert.equal(seen[seen.length - 1], "4,2");
  assert.ok(seen.length >= 5);
  for (let i = 1; i < seen.length; i++) {
    const [c0, r0] = seen[i - 1]!.split(",").map(Number);
    const [c1, r1] = seen[i]!.split(",").map(Number);
    assert.ok(Math.abs(c1! - c0!) <= 1 && Math.abs(r1! - r0!) <= 1);
  }
});
