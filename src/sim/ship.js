import { wrapPosition } from "./arena.js";

export const SHIP = {
  turnSpeed: 3.6,
  thrust: 420,
  drag: 0.9,
  maxSpeed: 520,
};

export function createShip(x, y, angle = -Math.PI / 2) {
  return { x, y, vx: 0, vy: 0, angle, thrust: false };
}

export function integrate(ship, input, dt) {
  let { x, y, vx, vy, angle } = ship;

  const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  angle += turn * SHIP.turnSpeed * dt;

  if (input.thrust) {
    vx += Math.cos(angle) * SHIP.thrust * dt;
    vy += Math.sin(angle) * SHIP.thrust * dt;
  }

  const damping = Math.max(0, 1 - SHIP.drag * dt);
  vx *= damping;
  vy *= damping;

  const speed = Math.hypot(vx, vy);
  if (speed > SHIP.maxSpeed) {
    vx = (vx / speed) * SHIP.maxSpeed;
    vy = (vy / speed) * SHIP.maxSpeed;
  }

  x += vx * dt;
  y += vy * dt;

  return wrapPosition({ x, y, vx, vy, angle, thrust: Boolean(input.thrust) });
}
