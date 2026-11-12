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

function readControls() {
  return {
    thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
    left: input.isDown("ArrowLeft") || input.isDown("KeyA"),
    right: input.isDown("ArrowRight") || input.isDown("KeyD"),
  };
}

function simulate(dt) {
  previous = current;
  current = integrate(current, readControls(), dt);
  input.endStep();
}

function render(alpha, stats) {
  beginFrame(ctx, view);
  drawBackground(ctx, ARENA);
  drawShip(ctx, interpolateShip(previous, current, alpha, ARENA), performance.now());
  drawHud(ctx, view, stats);
}

const loop = createLoop({ simulate, render });
loop.start();
