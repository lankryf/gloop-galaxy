import { busyWait, experiment, probe, probeControls } from "./experiments.js";
import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { beginFrame, setupCanvas } from "./render/canvas.js";
import {
  drawAsteroid,
  drawBackground,
  drawBullet,
  drawHud,
  drawShip,
  interpolate,
  interpolateShip,
} from "./render/draw.js";
import { ARENA } from "./sim/arena.js";
import { Asteroid } from "./sim/asteroid.js";
import { Ship } from "./sim/ship.js";
import { Vector2 } from "./sim/vector.js";
import { World } from "./sim/world.js";

const canvas = document.getElementById("game");
const { ctx, view } = setupCanvas(canvas, ARENA);
const input = createInput(window);
const world = new World({ seed: 42 });

const ship = world.spawn(new Ship({ pos: new Vector2(ARENA.width / 2, ARENA.height / 2) }));
ship.attach(world);
for (let i = 0; i < 6; i++) world.spawn(Asteroid.random(world.rng, ARENA));

input.onPress("Space", () => ship.fire());

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
  ship.controls = readControls();
  world.step(dt);
  simTime += dt;
  input.endStep();

  if (probe && !reported && simTime >= 5 - 1e-9) {
    reported = true;
    console.log(
      `probe t=${simTime.toFixed(4)} x=${ship.pos.x.toFixed(3)} y=${ship.pos.y.toFixed(3)} steps=${loop.stats.totalSteps + 1}`,
    );
  }
}

function render(alpha, stats) {
  frameCount++;
  if (experiment === "block" && frameCount % 60 === 0) busyWait(100);

  beginFrame(ctx, view);
  drawBackground(ctx, ARENA);
  for (const a of world.ofKind("asteroid")) drawAsteroid(ctx, a, interpolate(a, alpha, ARENA));
  for (const b of world.ofKind("bullet")) drawBullet(ctx, interpolate(b, alpha, ARENA));
  drawShip(ctx, interpolateShip(ship, alpha, ARENA), performance.now());
  drawHud(ctx, view, stats, [
    `jitter   ${stats.jitter.toFixed(2)} ms`,
    `entities ${world.size}`,
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
