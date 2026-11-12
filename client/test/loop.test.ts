import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createLoop } from "../src/loop.ts";

describe("fixed-step loop", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("runs 60 steps per simulated second whatever the frame rate", () => {
    const simulate = vi.fn();
    const loop = createLoop({ step: 1 / 60, simulate, render: () => {} });
    loop.start();
    vi.advanceTimersByTime(1000);
    loop.stop();
    expect(simulate.mock.calls.length).toBeGreaterThanOrEqual(59);
    expect(simulate.mock.calls.length).toBeLessThanOrEqual(61);
    expect(simulate).toHaveBeenCalledWith(1 / 60);
  });

  test("alpha passed to render is always in [0, 1)", () => {
    const alphas: number[] = [];
    const loop = createLoop({
      step: 1 / 30,
      simulate: () => {},
      render: (alpha) => alphas.push(alpha),
    });
    loop.start();
    vi.advanceTimersByTime(500);
    loop.stop();
    expect(alphas.length).toBeGreaterThan(10);
    for (const a of alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  test("a long stall is clamped to 0.25 s instead of hundreds of catch-up steps", () => {
    vi.useRealTimers();
    const raf: { frame: FrameRequestCallback | null } = { frame: null };
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      raf.frame = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      raf.frame = null;
    });
    const simulate = vi.fn();
    const loop = createLoop({ step: 1 / 60, simulate, render: () => {}, now: () => 0 });
    loop.start();
    raf.frame?.(5000);
    loop.stop();
    vi.unstubAllGlobals();
    expect(simulate).toHaveBeenCalledTimes(15);
  });

  test("stop cancels the next frame", () => {
    const render = vi.fn();
    const loop = createLoop({ simulate: () => {}, render });
    loop.start();
    vi.advanceTimersByTime(100);
    loop.stop();
    const calls = render.mock.calls.length;
    vi.advanceTimersByTime(100);
    expect(render.mock.calls.length).toBe(calls);
  });

  test("stats count steps per second", () => {
    const loop = createLoop({ step: 1 / 60, simulate: () => {}, render: () => {} });
    loop.start();
    vi.advanceTimersByTime(2100);
    loop.stop();
    expect(loop.stats.stepsPerSecond).toBeGreaterThanOrEqual(58);
    expect(loop.stats.stepsPerSecond).toBeLessThanOrEqual(62);
  });
});
