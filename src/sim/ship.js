import { ARENA, wrap } from "./arena.js";
import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export const SHIP = {
  turnSpeed: 3.6,
  thrust: 420,
  drag: 0.9,
  maxSpeed: 520,
  radius: 22,
};

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

  x = wrap(x + vx * dt, ARENA.width);
  y = wrap(y + vy * dt, ARENA.height);

  return { x, y, vx, vy, angle, thrust: Boolean(input.thrust) };
}

export class Ship extends Entity {
  constructor({ pos, angle = -Math.PI / 2, name = "pilot" }) {
    super({ kind: "ship", pos, angle, radius: SHIP.radius });
    this.name = name;
    this.controls = { thrust: false, left: false, right: false };
    this.thrust = false;
  }

  update(dt) {
    const next = integrate(
      { x: this.pos.x, y: this.pos.y, vx: this.vel.x, vy: this.vel.y, angle: this.angle },
      this.controls,
      dt,
    );
    this.pos = new Vector2(next.x, next.y);
    this.vel = new Vector2(next.vx, next.vy);
    this.angle = next.angle;
    this.thrust = next.thrust;
  }
}
