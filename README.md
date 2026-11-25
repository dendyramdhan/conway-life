# Life

Conway's Game of Life on a crisp, paintable grid.

Drag to draw. Right-drag, Shift, or Erase removes cells. Move pans the board. Scroll pans, and pinch or ⌘-scroll zooms without blurring the lattice. Play, step, and set the speed. Load a glider, the Gosper glider gun, a pulsar, a spaceship, the acorn, or the R-pentomino.

Rules are the standard B3/S23: a live cell survives with two or three neighbors, and a dead cell is born with exactly three. Edges can fade or wrap.

Space plays and pauses. `.` or → steps one generation.

The simulation core lives in `src/components/life`. Check it with:

```bash
node --experimental-strip-types --test src/components/life/engine.test.ts
```
