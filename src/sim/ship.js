import { ARENA, wrap } from "./arena.js";
import { BULLET, Bullet } from "./bullet.js";
import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export const SHIP = {
  turnSpeed: 3.6,
  thrust: 420,
  drag: 0.9,
  maxSpeed: 520,
  radius: 22,
  maxHp: 100,
  fireCooldown: 0.18,
  respawnDelay: 2,
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
  #hp = SHIP.maxHp;

  constructor({ pos, angle = -Math.PI / 2, name = "pilot" }) {
    super({ kind: "ship", pos, angle, radius: SHIP.radius });
    this.name = name;
    this.controls = { thrust: false, left: false, right: false, fire: false };
    this.thrust = false;
    this.cooldown = 0;
    this.score = 0;
    this.deaths = 0;
    this.dead = false;
    this.respawnIn = 0;
  }

  get hp() {
    return this.#hp;
  }

  damage(amount) {
    if (this.dead) return false;
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp > 0) return false;
    this.dead = true;
    this.collidable = false;
    this.deaths += 1;
    this.respawnIn = SHIP.respawnDelay;
    return true;
  }

  respawn(world) {
    const spot = world.findSafeSpot(this.radius, ARENA);
    this.pos = new Vector2(spot.x, spot.y);
    this.prevPos = this.pos;
    this.vel = new Vector2();
    this.#hp = SHIP.maxHp;
    this.dead = false;
    this.collidable = true;
  }

  fire(world) {
    const nose = this.pos.add(Vector2.fromAngle(this.angle, this.radius + 8));
    const vel = this.vel.add(Vector2.fromAngle(this.angle, BULLET.speed));
    world.spawn(new Bullet({ pos: nose, vel, ownerId: this.id }));
    this.cooldown = SHIP.fireCooldown;
  }

  update(dt, world) {
    if (this.dead) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) this.respawn(world);
      return;
    }

    const next = integrate(
      { x: this.pos.x, y: this.pos.y, vx: this.vel.x, vy: this.vel.y, angle: this.angle },
      this.controls,
      dt,
    );
    this.pos = new Vector2(next.x, next.y);
    this.vel = new Vector2(next.vx, next.vy);
    this.angle = next.angle;
    this.thrust = next.thrust;

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.controls.fire && this.cooldown === 0) this.fire(world);
  }
}
