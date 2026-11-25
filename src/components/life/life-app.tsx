import { useEffect, useRef, useState } from "react";
import {
  Eraser,
  Hand,
  LocateFixed,
  Pause,
  Pencil,
  Play,
  Shuffle,
  SkipForward,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { clampCamera, clampCell, frameAt, zoomAt } from "./camera";
import {
  COLS,
  ROWS,
  applyIndices,
  bounds,
  clear,
  createGrid,
  index,
  lineCells,
  liveIndices,
  randomFill,
  stamp,
  step,
  type Grid,
} from "./engine";
import { PATTERNS, patternById, placement, type Pattern } from "./patterns";

type Tool = "draw" | "erase" | "pan";
type Stroke = "draw" | "erase" | "pan";

type Sim = {
  current: Grid;
  next: Grid;
  backup: Grid;
  generation: number;
  population: number;
  playing: boolean;
  speed: number;
  wrap: boolean;
  tool: Tool;
  cellCss: number;
  camX: number;
  camY: number;
  acc: number;
  last: number;
  booted: boolean;
  pending: { c: number; r: number; ax: number } | null;
  hoverC: number;
  hoverR: number;
  stroke: Stroke | null;
  lastC: number;
  lastR: number;
  visited: Set<number>;
  pointers: Map<number, { x: number; y: number }>;
  pinch: { dist: number; cell: number; worldC: number; worldR: number } | null;
  save: () => void;
};

type Colors = {
  void: string;
  stage: string;
  grid: string;
  cell: string;
  line: string;
  accent: string;
};

const SAVE_KEY = "conway-life-v1";

function makeSim(): Sim {
  return {
    current: createGrid(),
    next: createGrid(),
    backup: createGrid(),
    generation: 0,
    population: 0,
    playing: false,
    speed: 10,
    wrap: false,
    tool: "draw",
    cellCss: 12,
    camX: 0,
    camY: 0,
    acc: 0,
    last: 0,
    booted: false,
    pending: null,
    hoverC: -1,
    hoverR: -1,
    stroke: null,
    lastC: -1,
    lastR: -1,
    visited: new Set(),
    pointers: new Map(),
    pinch: null,
    save: () => {},
  };
}

function readColors(): Colors {
  const css = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    void: pick("--color-void", "#0b0e0b"),
    stage: pick("--color-stage", "#16201b"),
    grid: pick("--color-grid", "#0c1210"),
    cell: pick("--color-cell", "#d2f06a"),
    line: pick("--color-line", "#2c3830"),
    accent: pick("--color-accent", "#d2f06a"),
  };
}

function controlClass(active = false): string {
  return [
    "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm",
    active ? "border-accent bg-accent text-ink" : "border-line bg-raise text-fg hover:bg-line",
  ].join(" ");
}

export function LifeApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef<HTMLSpanElement>(null);
  const coordRef = useRef<HTMLParagraphElement>(null);
  const simRef = useRef<Sim | null>(null);
  if (!simRef.current) simRef.current = makeSim();

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [tool, setTool] = useState<Tool>("draw");
  const [wrap, setWrap] = useState(false);
  const [cellCss, setCellCss] = useState(simRef.current.cellCss);
  const [preset, setPreset] = useState<string | null>("glider");
  const [stats, setStats] = useState({ gen: 0, pop: 0 });
  const [empty, setEmpty] = useState(false);

  const uiRef = useRef({ setPlaying, setSpeed, setTool, setWrap, setCellCss, setPreset, setStats, setEmpty });
  uiRef.current = { setPlaying, setSpeed, setTool, setWrap, setCellCss, setPreset, setStats, setEmpty };

  useEffect(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const colors = readColors();
    let raf = 0;
    let saveTimer = 0;
    let alive = true;

    const writeSave = () => {
      try {
        const payload = {
          v: 1 as const,
          cols: COLS,
          rows: ROWS,
          gen: sim.generation,
          cells: liveIndices(sim.current),
          speed: sim.speed,
          wrap: sim.wrap,
          cell: sim.cellCss,
          tool: sim.tool,
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      } catch {
        /* private mode or quota */
      }
    };
    sim.save = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(writeSave, 400);
    };

    const view = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });

    const applyPending = () => {
      if (!sim.pending) return;
      const { w, h } = view();
      if (w < 2 || h < 2) return;
      frameAt(sim, sim.pending.c, sim.pending.r, w, h, sim.pending.ax);
      sim.pending = null;
    };

    let shownGen = -1;
    let shownPop = -1;
    let shownEmpty = false;
    const publish = () => {
      if (sim.generation !== shownGen || sim.population !== shownPop) {
        shownGen = sim.generation;
        shownPop = sim.population;
        uiRef.current.setStats({ gen: sim.generation, pop: sim.population });
      }
      const isEmpty = sim.population === 0;
      if (isEmpty !== shownEmpty) {
        shownEmpty = isEmpty;
        uiRef.current.setEmpty(isEmpty);
      }
      if (zoomRef.current) zoomRef.current.textContent = `${sim.cellCss}px`;
      if (coordRef.current) {
        const inside = sim.hoverC >= 0 && sim.hoverC < COLS && sim.hoverR >= 0 && sim.hoverR < ROWS;
        const label = inside ? `${sim.hoverC},${sim.hoverR}` : "";
        if (coordRef.current.textContent !== label) coordRef.current.textContent = label;
      }
    };

    const place = (pattern: Pattern) => {
      const spot = placement(pattern);
      sim.population = stamp(sim.current, pattern.cells, spot.originCol, spot.originRow);
      sim.generation = 0;
      sim.acc = 0;
      sim.pending = { c: spot.focusCol, r: spot.focusRow, ax: pattern.anchorX };
      applyPending();
      publish();
      sim.save();
    };

    const boot = () => {
      if (sim.booted) return;
      sim.booted = true;
      let restored = false;
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
          const data = JSON.parse(raw) as {
            v?: number;
            cols?: number;
            rows?: number;
            gen?: number;
            cells?: number[];
            speed?: number;
            wrap?: boolean;
            cell?: number;
            tool?: Tool;
          };
          if (data.v === 1 && data.cols === COLS && data.rows === ROWS && Array.isArray(data.cells)) {
            sim.population = applyIndices(sim.current, data.cells);
            sim.generation = data.gen ?? 0;
            sim.speed = data.speed && data.speed > 0 ? data.speed : 10;
            sim.wrap = Boolean(data.wrap);
            sim.cellCss = clampCell(data.cell ?? sim.cellCss);
            sim.tool = data.tool === "erase" || data.tool === "pan" ? data.tool : "draw";
            const box = bounds(sim.current);
            sim.pending = box
              ? { c: (box.minC + box.maxC + 1) / 2, r: (box.minR + box.maxR + 1) / 2, ax: 0.5 }
              : { c: COLS / 2, r: ROWS / 2, ax: 0.5 };
            restored = true;
          }
        }
      } catch {
        restored = false;
      }
      if (!restored) {
        if (window.innerWidth < 720) {
          sim.cellCss = 16;
          uiRef.current.setCellCss(16);
        }
        const glider = patternById("glider");
        if (glider) place(glider);
      } else {
        uiRef.current.setSpeed(sim.speed);
        uiRef.current.setWrap(sim.wrap);
        uiRef.current.setTool(sim.tool);
        uiRef.current.setCellCss(sim.cellCss);
        uiRef.current.setPreset(null);
        uiRef.current.setPlaying(false);
      }
      publish();
    };

    const advance = () => {
      sim.population = step(sim.current, sim.next, sim.wrap);
      const swap = sim.current;
      sim.current = sim.next;
      sim.next = swap;
      sim.generation += 1;
    };

    const cellAt = (xCss: number, yCss: number) => {
      const dpr = window.devicePixelRatio || 1;
      const cellDev = Math.max(1, Math.round(sim.cellCss * dpr));
      const ox = Math.round(sim.camX * dpr);
      const oy = Math.round(sim.camY * dpr);
      return {
        c: Math.floor((xCss * dpr - ox) / cellDev),
        r: Math.floor((yCss * dpr - oy) / cellDev),
      };
    };

    const paintOne = (col: number, row: number, mode: "draw" | "erase") => {
      if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return;
      const i = index(col, row);
      if (sim.visited.has(i)) return;
      sim.visited.add(i);
      const next = mode === "draw" ? 1 : 0;
      if (sim.current[i] !== next) {
        sim.population += next - sim.current[i]!;
        sim.current[i] = next;
      }
    };

    const paintTo = (col: number, row: number, mode: "draw" | "erase") => {
      if (sim.lastC < 0) paintOne(col, row, mode);
      else lineCells(sim.lastC, sim.lastR, col, row, (c, r) => paintOne(c, r, mode));
      sim.lastC = col;
      sim.lastR = row;
    };

    const localPoint = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const draw = () => {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW < 2 || cssH < 2) return;
      applyPending();
      const dpr = window.devicePixelRatio || 1;
      const bw = Math.max(1, Math.round(cssW * dpr));
      const bh = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      const cellDev = Math.max(1, Math.round(sim.cellCss * dpr));
      const ox = Math.round(sim.camX * dpr);
      const oy = Math.round(sim.camY * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = colors.void;
      ctx.fillRect(0, 0, bw, bh);
      ctx.fillStyle = colors.stage;
      ctx.fillRect(ox, oy, COLS * cellDev, ROWS * cellDev);

      const c0 = Math.max(0, Math.floor(-ox / cellDev));
      const r0 = Math.max(0, Math.floor(-oy / cellDev));
      const c1 = Math.min(COLS - 1, Math.ceil((bw - ox) / cellDev));
      const r1 = Math.min(ROWS - 1, Math.ceil((bh - oy) / cellDev));
      const gutter = cellDev >= 8 ? 1 : 0;

      if (gutter && c1 >= c0 && r1 >= r0) {
        const xStart = ox + c0 * cellDev;
        const yStart = oy + r0 * cellDev;
        const xEnd = ox + (Math.min(COLS, c1 + 1)) * cellDev;
        const yEnd = oy + (Math.min(ROWS, r1 + 1)) * cellDev;
        ctx.beginPath();
        ctx.fillStyle = colors.grid;
        for (let c = c0; c <= Math.min(COLS, c1 + 1); c++) {
          ctx.rect(ox + c * cellDev, yStart, 1, Math.max(0, yEnd - yStart));
        }
        for (let r = r0; r <= Math.min(ROWS, r1 + 1); r++) {
          ctx.rect(xStart, oy + r * cellDev, Math.max(0, xEnd - xStart), 1);
        }
        ctx.fill();
      }

      ctx.fillStyle = colors.cell;
      for (let r = r0; r <= r1; r++) {
        const base = r * COLS;
        const y = oy + r * cellDev;
        for (let c = c0; c <= c1; c++) {
          if (!sim.current[base + c]) continue;
          const x = ox + c * cellDev;
          if (gutter) ctx.fillRect(x + 1, y + 1, cellDev - 1, cellDev - 1);
          else ctx.fillRect(x, y, cellDev, cellDev);
        }
      }

      if (
        sim.tool !== "pan" &&
        sim.stroke !== "pan" &&
        sim.hoverC >= 0 &&
        sim.hoverR >= 0 &&
        sim.hoverC < COLS &&
        sim.hoverR < ROWS
      ) {
        const x = ox + sim.hoverC * cellDev + gutter;
        const y = oy + sim.hoverR * cellDev + gutter;
        const w = Math.max(1, cellDev - gutter);
        const h = Math.max(1, cellDev - gutter);
        ctx.fillStyle = colors.accent;
        ctx.fillRect(x, y, w, 1);
        ctx.fillRect(x, y + h - 1, w, 1);
        ctx.fillRect(x, y, 1, h);
        ctx.fillRect(x + w - 1, y, 1, h);
      }

      ctx.fillStyle = colors.line;
      const worldW = COLS * cellDev;
      const worldH = ROWS * cellDev;
      ctx.fillRect(ox, oy, worldW, 1);
      ctx.fillRect(ox, oy + worldH - 1, worldW, 1);
      ctx.fillRect(ox, oy, 1, worldH);
      ctx.fillRect(ox + worldW - 1, oy, 1, worldH);
    };

    const frame = (now: number) => {
      if (!alive) return;
      if (sim.last === 0) sim.last = now;
      const dt = Math.min(0.1, (now - sim.last) / 1000);
      sim.last = now;
      if (sim.playing) {
        sim.acc += dt;
        const interval = 1 / Math.max(1, sim.speed);
        let steps = 0;
        while (sim.acc >= interval && steps < 6) {
          advance();
          sim.acc -= interval;
          steps += 1;
        }
        if (steps === 6) sim.acc = 0;
      }
      draw();
      publish();
      raf = requestAnimationFrame(frame);
    };

    const endStroke = () => {
      if (sim.stroke === "draw" || sim.stroke === "erase") {
        uiRef.current.setPreset(null);
        sim.save();
      }
      sim.stroke = null;
      sim.visited.clear();
      sim.lastC = -1;
      sim.lastR = -1;
      sim.pinch = null;
      canvas.style.cursor = sim.tool === "pan" ? "grab" : "crosshair";
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button > 2) return;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic events in tests */
      }
      sim.pointers.set(event.pointerId, localPoint(event));
      if (sim.pointers.size >= 2) {
        sim.current.set(sim.backup);
        sim.population = countBackup();
        const pts = [...sim.pointers.values()];
        const a = pts[0]!;
        const b = pts[1]!;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        sim.pinch = {
          dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          cell: sim.cellCss,
          worldC: (midX - sim.camX) / sim.cellCss,
          worldR: (midY - sim.camY) / sim.cellCss,
        };
        sim.stroke = null;
        sim.visited.clear();
        return;
      }
      sim.backup.set(sim.current);
      const point = localPoint(event);
      let mode: Stroke = sim.tool;
      if (event.button === 1) mode = "pan";
      else if (event.button === 2 || event.shiftKey || sim.tool === "erase") mode = "erase";
      else if (sim.tool === "pan") mode = "pan";
      else mode = "draw";
      sim.stroke = mode;
      sim.visited.clear();
      sim.lastC = -1;
      sim.lastR = -1;
      if (mode === "pan") {
        canvas.style.cursor = "grabbing";
        return;
      }
      const cell = cellAt(point.x, point.y);
      paintTo(cell.c, cell.r, mode);
      sim.hoverC = cell.c;
      sim.hoverR = cell.r;
    };

    const countBackup = () => {
      let n = 0;
      for (let i = 0; i < sim.backup.length; i++) n += sim.backup[i]!;
      return n;
    };

    const onPointerMove = (event: PointerEvent) => {
      const point = localPoint(event);
      const previous = sim.pointers.get(event.pointerId);
      if (sim.pointers.has(event.pointerId)) sim.pointers.set(event.pointerId, point);
      if (sim.pointers.size >= 2 && sim.pinch) {
        const pts = [...sim.pointers.values()];
        const a = pts[0]!;
        const b = pts[1]!;
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const next = clampCell(sim.pinch.cell * (dist / sim.pinch.dist));
        const { w, h } = view();
        sim.cellCss = next;
        sim.camX = midX - sim.pinch.worldC * next;
        sim.camY = midY - sim.pinch.worldR * next;
        clampCamera(sim, w, h);
        if (zoomRef.current) zoomRef.current.textContent = `${sim.cellCss}px`;
        return;
      }
      if (sim.stroke === "pan" && previous) {
        sim.camX += point.x - previous.x;
        sim.camY += point.y - previous.y;
        const { w, h } = view();
        clampCamera(sim, w, h);
        return;
      }
      const events = event.getCoalescedEvents?.() ?? [event];
      let cell = cellAt(point.x, point.y);
      if (sim.stroke === "draw" || sim.stroke === "erase") {
        for (const sample of events) {
          const p = localPoint(sample);
          cell = cellAt(p.x, p.y);
          paintTo(cell.c, cell.r, sim.stroke);
        }
      } else {
        cell = cellAt(point.x, point.y);
      }
      sim.hoverC = cell.c;
      sim.hoverR = cell.r;
    };

    const onPointerUp = (event: PointerEvent) => {
      sim.pointers.delete(event.pointerId);
      if (sim.pointers.size < 2) sim.pinch = null;
      if (sim.pointers.size === 0) {
        uiRef.current.setCellCss(sim.cellCss);
        endStroke();
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = localPoint(event);
      const { w, h } = view();
      if (event.ctrlKey || event.metaKey) {
        const dir = event.deltaY > 0 ? -2 : 2;
        zoomAt(sim, point.x, point.y, sim.cellCss + dir, w, h);
        uiRef.current.setCellCss(sim.cellCss);
      } else {
        sim.camX -= event.deltaX;
        sim.camY -= event.deltaY;
        clampCamera(sim, w, h);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button, a, input, textarea, [role='slider']")) return;
      if (event.code === "Space") {
        if (event.repeat) return;
        event.preventDefault();
        sim.playing = !sim.playing;
        sim.acc = 0;
        uiRef.current.setPlaying(sim.playing);
        sim.save();
        return;
      }
      if (event.key === "." || event.key === "ArrowRight") {
        event.preventDefault();
        advance();
        sim.acc = 0;
        sim.save();
      } else if (event.key === "-" || event.key === "_") {
        const { w, h } = view();
        zoomAt(sim, w / 2, h / 2, sim.cellCss - 2, w, h);
        uiRef.current.setCellCss(sim.cellCss);
        sim.save();
      } else if (event.key === "=" || event.key === "+") {
        const { w, h } = view();
        zoomAt(sim, w / 2, h / 2, sim.cellCss + 2, w, h);
        uiRef.current.setCellCss(sim.cellCss);
        sim.save();
      }
    };


    const onContext = (event: Event) => event.preventDefault();
    const onLeave = () => {
      if (!sim.stroke) {
        sim.hoverC = -1;
        sim.hoverR = -1;
      }
    };

    boot();
    canvas.style.cursor = sim.tool === "pan" ? "grab" : "crosshair";
    const resize = new ResizeObserver(() => applyPending());
    resize.observe(canvas);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("contextmenu", onContext);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    const onHide = () => {
      if (document.visibilityState === "hidden") writeSave();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", writeSave);
    const autosave = window.setInterval(() => {
      if (sim.playing) writeSave();
    }, 4000);
    raf = requestAnimationFrame(frame);

    const api = {
      togglePlay() {
        sim.playing = !sim.playing;
        sim.acc = 0;
        uiRef.current.setPlaying(sim.playing);
        sim.save();
      },
      stepOnce() {
        advance();
        sim.acc = 0;
        sim.save();
      },
      setSpeed(value: number) {
        sim.speed = value;
        uiRef.current.setSpeed(value);
        sim.save();
      },
      setTool(next: Tool) {
        sim.tool = next;
        uiRef.current.setTool(next);
        canvas.style.cursor = next === "pan" ? "grab" : "crosshair";
        sim.save();
      },
      setWrap(next: boolean) {
        sim.wrap = next;
        uiRef.current.setWrap(next);
        sim.save();
      },
      zoom(dir: number) {
        const { w, h } = view();
        zoomAt(sim, w / 2, h / 2, sim.cellCss + dir, w, h);
        uiRef.current.setCellCss(sim.cellCss);
        sim.save();
      },
      center() {
        const box = bounds(sim.current);
        const { w, h } = view();
        if (w < 2) return;
        if (box) frameAt(sim, (box.minC + box.maxC + 1) / 2, (box.minR + box.maxR + 1) / 2, w, h, 0.5);
        else frameAt(sim, COLS / 2, ROWS / 2, w, h, 0.5);
      },
      clearGrid() {
        clear(sim.current);
        sim.population = 0;
        sim.generation = 0;
        sim.acc = 0;
        uiRef.current.setPreset(null);
        sim.save();
      },
      randomize() {
        sim.population = randomFill(sim.current, 0.2);
        sim.generation = 0;
        sim.acc = 0;
        uiRef.current.setPreset(null);
        const { w, h } = view();
        if (w > 2) frameAt(sim, COLS / 2, ROWS / 2, w, h, 0.5);
        sim.save();
      },
      load(id: string) {
        const pattern = patternById(id);
        if (!pattern) return;
        if (sim.playing) {
          sim.playing = false;
          sim.acc = 0;
          uiRef.current.setPlaying(false);
        }
        place(pattern);
        uiRef.current.setPreset(id);
      },
    };
    actions.current = api;

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(saveTimer);
      window.clearInterval(autosave);
      resize.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("contextmenu", onContext);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", writeSave);
      writeSave();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    if (sim.stroke === "pan") return;
    canvas.style.cursor = tool === "pan" ? "grab" : "crosshair";
  }, [tool]);

  return (
    <main className="flex h-dvh select-none flex-col bg-void text-fg">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-4">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl italic leading-none tracking-tight text-balance">Life</h1>
          <p className="hidden text-xs text-muted sm:block">Conway · B3/S23</p>
        </div>
        <div className="ml-auto flex items-center gap-3 font-mono text-xs tabular-nums sm:gap-5 sm:text-sm">
          <span className="flex items-center gap-2">
            <span className={playing ? "pulse-dot size-2 rounded-full bg-accent" : "size-2 rounded-full bg-line"} />
            <span className="text-muted">gen</span>
            <span>{stats.gen.toLocaleString("en-US")}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-muted">pop</span>
            <span>{stats.pop.toLocaleString("en-US")}</span>
          </span>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none bg-void"
          role="application"
          aria-label="Conway's Game of Life grid. Drag to paint cells."
        />
        <p className="pointer-events-none absolute left-3 top-3 max-w-xs text-xs text-pretty text-muted">
          <span className="sm:hidden">Drag to paint. Pinch to zoom.</span>
          <span className="hidden sm:inline">Drag to paint. Right-drag erases. Scroll pans, ⌘-scroll zooms.</span>
        </p>
        <p
          ref={coordRef}
          className="pointer-events-none absolute right-3 top-3 font-mono text-xs tabular-nums text-muted"
        />
        {empty ? (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted">
            Nothing alive. Paint, randomize, or place a pattern.
          </p>
        ) : null}
      </div>

      <footer className="dock shrink-0 border-t border-line bg-surface">
        <div className="flex flex-col gap-2 px-3 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 text-sm text-ink sm:px-4"
              aria-pressed={playing}
              title="Space"
              onClick={() => actions.current?.togglePlay()}
            >
              {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className={controlClass()}
              title="Step one generation"
              onClick={() => actions.current?.stepOnce()}
            >
              <SkipForward className="size-4" aria-hidden />
              Step
            </button>
            <label className="flex min-w-52 flex-1 items-center gap-3">
              <span className="text-xs text-muted">Speed</span>
              <input
                type="range"
                min={1}
                max={40}
                step={1}
                value={speed}
                aria-label="Speed in generations per second"
                className="speed"
                onChange={(event) => actions.current?.setSpeed(Number(event.target.value))}
              />
              <span className="w-12 text-right font-mono text-xs tabular-nums text-muted">{speed}/s</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={controlClass(tool === "draw")}
              aria-pressed={tool === "draw"}
              onClick={() => actions.current?.setTool("draw")}
            >
              <Pencil className="size-4" aria-hidden />
              Draw
            </button>
            <button
              type="button"
              className={controlClass(tool === "erase")}
              aria-pressed={tool === "erase"}
              onClick={() => actions.current?.setTool("erase")}
            >
              <Eraser className="size-4" aria-hidden />
              Erase
            </button>
            <button
              type="button"
              className={controlClass(tool === "pan")}
              aria-pressed={tool === "pan"}
              onClick={() => actions.current?.setTool("pan")}
            >
              <Hand className="size-4" aria-hidden />
              Move
            </button>
            <button type="button" className={controlClass()} aria-label="Zoom out" onClick={() => actions.current?.zoom(-2)}>
              <ZoomOut className="size-4" aria-hidden />
            </button>
            <button type="button" className={controlClass()} aria-label="Zoom in" onClick={() => actions.current?.zoom(2)}>
              <ZoomIn className="size-4" aria-hidden />
            </button>
            <span ref={zoomRef} className="inline-flex h-11 items-center font-mono text-xs tabular-nums text-muted">
              {cellCss}px
            </span>
            <button type="button" className={controlClass()} aria-label="Center on life" onClick={() => actions.current?.center()}>
              <LocateFixed className="size-4" aria-hidden />
            </button>
            <button type="button" className={controlClass()} onClick={() => actions.current?.clearGrid()}>
              <Trash2 className="size-4" aria-hidden />
              Clear
            </button>
            <button type="button" className={controlClass()} onClick={() => actions.current?.randomize()}>
              <Shuffle className="size-4" aria-hidden />
              Random
            </button>
            <button
              type="button"
              className={controlClass(wrap)}
              aria-pressed={wrap}
              onClick={() => actions.current?.setWrap(!wrap)}
            >
              {wrap ? "Wrap on" : "Wrap off"}
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-xs text-muted">Patterns</span>
            {PATTERNS.map((pattern) => (
              <button
                key={pattern.id}
                type="button"
                className={controlClass(preset === pattern.id)}
                aria-pressed={preset === pattern.id}
                onClick={() => actions.current?.load(pattern.id)}
              >
                {pattern.name}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}

const actions: { current: null | {
  togglePlay: () => void;
  stepOnce: () => void;
  setSpeed: (value: number) => void;
  setTool: (tool: Tool) => void;
  setWrap: (wrap: boolean) => void;
  zoom: (dir: number) => void;
  center: () => void;
  clearGrid: () => void;
  randomize: () => void;
  load: (id: string) => void;
} } = { current: null };
