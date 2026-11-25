import { COLS, ROWS } from "./engine";

export const CELL_MIN = 6;
export const CELL_MAX = 40;

export type Camera = {
  camX: number;
  camY: number;
  cellCss: number;
};

export function clampCell(size: number): number {
  return Math.min(CELL_MAX, Math.max(CELL_MIN, Math.round(size)));
}

export function clampCamera(camera: Camera, viewW: number, viewH: number): void {
  const worldW = COLS * camera.cellCss;
  const worldH = ROWS * camera.cellCss;
  const marginX = Math.min(viewW * 0.45, 220);
  const marginY = Math.min(viewH * 0.45, 180);
  const minX = marginX - worldW;
  const maxX = viewW - marginX;
  const minY = marginY - worldH;
  const maxY = viewH - marginY;
  camera.camX = minX > maxX ? (viewW - worldW) / 2 : Math.min(maxX, Math.max(minX, camera.camX));
  camera.camY = minY > maxY ? (viewH - worldH) / 2 : Math.min(maxY, Math.max(minY, camera.camY));
}

/** Keep the world cell under the CSS point (x, y) fixed while changing cell size. */
export function zoomAt(camera: Camera, x: number, y: number, nextSize: number, viewW: number, viewH: number): void {
  const next = clampCell(nextSize);
  const worldC = (x - camera.camX) / camera.cellCss;
  const worldR = (y - camera.camY) / camera.cellCss;
  camera.cellCss = next;
  camera.camX = x - worldC * next;
  camera.camY = y - worldR * next;
  clampCamera(camera, viewW, viewH);
}

export function frameAt(
  camera: Camera,
  focusCol: number,
  focusRow: number,
  viewW: number,
  viewH: number,
  anchorX = 0.5,
): void {
  camera.camX = viewW * anchorX - focusCol * camera.cellCss;
  camera.camY = viewH * 0.5 - focusRow * camera.cellCss;
  clampCamera(camera, viewW, viewH);
}
