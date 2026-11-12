import { Samples } from "./perf.ts";

const MAX_FRAME = 0.25;

export type Scheduler = "raf" | "interval";

export interface LoopStats {
  stepsPerSecond: number;
  framesPerSecond: number;
  frameTime: number;
  jitter: number;
  worstInterval: number;
  totalSteps: number;
}

export interface Loop {
  readonly stats: LoopStats;
  readonly frames: Samples;
  start(): void;
  stop(): void;
}

export interface LoopOptions {
  readonly step?: number;
  readonly simulate: (dt: number) => void;
  readonly render: (alpha: number, stats: LoopStats) => void;
  readonly scheduler?: Scheduler;
  readonly fixedStep?: boolean;
  readonly now?: () => number;
}

export function createLoop({
  step = 1 / 60,
  simulate,
  render,
  scheduler = "raf",
  fixedStep = true,
  now = () => performance.now(),
}: LoopOptions): Loop {
  let running = false;
  let handle = 0;
  let last = 0;
  let accumulator = 0;

  let windowStart = 0;
  let stepsInWindow = 0;
  let framesInWindow = 0;
  let intervals: number[] = [];

  const frames = new Samples();
  const stats: LoopStats = {
    stepsPerSecond: 0,
    framesPerSecond: 0,
    frameTime: 0,
    jitter: 0,
    worstInterval: 0,
    totalSteps: 0,
  };

  function tick(t: number): void {
    const frameStart = now();
    const delta = Math.min((t - last) / 1000, MAX_FRAME);
    intervals.push(t - last);
    last = t;

    if (fixedStep) {
      accumulator += delta;
      while (accumulator >= step) {
        simulate(step);
        accumulator -= step;
        stepsInWindow++;
        stats.totalSteps++;
      }
      render(accumulator / step, stats);
    } else {
      simulate(delta);
      stepsInWindow++;
      stats.totalSteps++;
      render(1, stats);
    }
    framesInWindow++;

    if (t - windowStart >= 1000) {
      const seconds = (t - windowStart) / 1000;
      stats.stepsPerSecond = Math.round(stepsInWindow / seconds);
      stats.framesPerSecond = Math.round(framesInWindow / seconds);
      stats.jitter = standardDeviation(intervals);
      stats.worstInterval = Math.max(...intervals);
      stepsInWindow = 0;
      framesInWindow = 0;
      intervals = [];
      windowStart = t;
    }

    stats.frameTime = now() - frameStart;
    frames.push(stats.frameTime);
  }

  function onFrame(t: number): void {
    if (!running) return;
    tick(t);
    handle = requestAnimationFrame(onFrame);
  }

  return {
    stats,
    frames,
    start() {
      if (running) return;
      running = true;
      last = now();
      windowStart = last;
      accumulator = 0;
      if (scheduler === "interval") {
        handle = window.setInterval(() => tick(now()), 16);
      } else {
        handle = requestAnimationFrame(onFrame);
      }
    },
    stop() {
      running = false;
      if (scheduler === "interval") clearInterval(handle);
      else cancelAnimationFrame(handle);
    },
  };
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
