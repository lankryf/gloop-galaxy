const MAX_FRAME = 0.25;

export function createLoop({ step = 1 / 60, simulate, render, now = () => performance.now() }) {
  let running = false;
  let rafId = 0;
  let last = 0;
  let accumulator = 0;

  let windowStart = 0;
  let stepsInWindow = 0;
  let framesInWindow = 0;

  const stats = {
    stepsPerSecond: 0,
    framesPerSecond: 0,
    frameTime: 0,
    totalSteps: 0,
  };

  function frame(t) {
    if (!running) return;
    const frameStart = now();
    const delta = Math.min((t - last) / 1000, MAX_FRAME);
    last = t;
    accumulator += delta;

    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;
      stepsInWindow++;
      stats.totalSteps++;
    }

    render(accumulator / step, stats);
    framesInWindow++;

    if (t - windowStart >= 1000) {
      const seconds = (t - windowStart) / 1000;
      stats.stepsPerSecond = Math.round(stepsInWindow / seconds);
      stats.framesPerSecond = Math.round(framesInWindow / seconds);
      stepsInWindow = 0;
      framesInWindow = 0;
      windowStart = t;
    }

    stats.frameTime = now() - frameStart;
    rafId = requestAnimationFrame(frame);
  }

  return {
    stats,
    start() {
      if (running) return;
      running = true;
      last = now();
      windowStart = last;
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
  };
}
