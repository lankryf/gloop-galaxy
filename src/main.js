import { busyWait, experiment, probe, probeControls } from "./experiments.js";
import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { beginFrame, setupCanvas } from "./render/canvas.js";
import { drawBackground, drawHud, drawShip, interpolateShip } from "./render/draw.js";
import { ARENA } from "./sim/arena.js";
import { createShip, integrate } from "./sim/ship.js";

const canvas = document.getElementById("game");
const { ctx, view } = setupCanvas(canvas, ARENA);
const input = createInput(window);

let previous = createShip(ARENA.width / 2, ARENA.height / 2);
let current = previous;
let simTime = 0;
let reported = false;
let frameCount = 0;

function readControls() {
  if (probe) return probeControls(simTime);
  return {
    thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
    left: input.isDown("ArrowLeft") || input.isDown("KeyA"),
    right: input.isDown("ArrowRight") || input.isDown("KeyD"),
  };
}

function simulate(dt) {
  previous = current;
  current = integrate(current, readControls(), dt);
  simTime += dt;
  input.endStep();

  if (probe && !reported && simTime >= 5 - 1e-9) {
    reported = true;
    console.log(
      `probe t=${simTime.toFixed(4)} x=${current.x.toFixed(3)} y=${current.y.toFixed(3)} steps=${loop.stats.totalSteps + 1}`,
    );
  }
}

function render(alpha, stats) {
  frameCount++;
  if (experiment === "block" && frameCount % 60 === 0) busyWait(100);

  beginFrame(ctx, view);
  drawBackground(ctx, ARENA);
  drawShip(ctx, interpolateShip(previous, current, alpha, ARENA), performance.now());
  drawHud(ctx, view, stats, [
    `jitter   ${stats.jitter.toFixed(2)} ms`,
    experiment ? `exp      ${experiment}` : "",
  ]);
}

const loop = createLoop({
  simulate,
  render,
  scheduler: experiment === "interval" ? "interval" : "raf",
  fixedStep: experiment !== "variable",
});
loop.start();

if (probe) {
  setInterval(() => {
    const s = loop.stats;
    console.log(
      `stats steps/s=${s.stepsPerSecond} frames/s=${s.framesPerSecond} frame=${s.frameTime.toFixed(2)} jitter=${s.jitter.toFixed(2)} worst=${s.worstInterval.toFixed(1)}`,
    );
  }, 1000);
}
