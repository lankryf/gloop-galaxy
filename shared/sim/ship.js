import { ARENA, wrap } from "./arena.js";
import { homing } from "./behaviors.js";
import { BULLET, Bullet } from "./bullet.js";
import { Entity } from "./entity.js";
import { cos, hypot, sin } from "./fmath.js";
import { gravityAt, wellFields } from "./gravity.js";
import { EFFECT_DURATION } from "./pickup.js";
import { Vector2 } from "./vector.js";

export const SHIP = {
  turnSpeed: 3.6,
  thrust: 420,
  drag: 0.9,
  maxSpeed: 520,
  radius: 22,
  maxHp: 100,
  fireCooldown: 0.18,
  rapidCooldown: 0.07,
  respawnDelay: 2,
};

export function integrate(ship, input, dt) {
  let { x, y, vx, vy, angle } = ship;

  const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  angle += turn * SHIP.turnSpeed * dt;

  if (input.thrust) {
    vx += cos(angle) * SHIP.thrust * dt;
    vy += sin(angle) * SHIP.thrust * dt;
  }

  const damping = Math.max(0, 1 - SHIP.drag * dt);
  vx *= damping;
  vy *= damping;

  const speed = hypot(vx, vy);
  if (speed > SHIP.maxSpeed) {
    vx = (vx / speed) * SHIP.maxSpeed;
    vy = (vy / speed) * SHIP.maxSpeed;
  }

  x = wrap(x + vx * dt, ARENA.width);
  y = wrap(y + vy * dt, ARENA.height);

  return { x, y, vx, vy, angle, thrust: Boolean(input.thrust) };
}

export function quantizeAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return Math.round(a * 10000) / 10000;
}

export function quantizeShip(state) {
  return {
    ...state,
    x: Math.fround(state.x),
    y: Math.fround(state.y),
    vx: Math.fround(state.vx),
    vy: Math.fround(state.vy),
    angle: quantizeAngle(state.angle),
  };
}

export function shipPhysics(state, input, dt, wells) {
  const next = integrate(state, input, dt);
  if (wells.length > 0) {
    const { ax, ay } = gravityAt(next.x, next.y, wells);
    next.vx += ax * dt;
    next.vy += ay * dt;
  }
  return quantizeShip(next);
}

export class Ship extends Entity {
  #hp = SHIP.maxHp;

  constructor({ pos, angle = -Math.PI / 2, name = "pilot", inputDriven = false }) {
    super({ kind: "ship", pos, angle: quantizeAngle(angle), radius: SHIP.radius });
    this.name = name;
    this.inputDriven = inputDriven;
    this.controls = { thrust: false, left: false, right: false, fire: false };
    this.thrust = false;
    this.cooldown = 0;
    this.score = 0;
    this.deaths = 0;
    this.dead = false;
    this.respawnIn = 0;
    this.effects = new Map();
  }

  get hp() {
    return this.#hp;
  }

  damage(amount) {
    if (this.dead || this.effects.has("shield")) return false;
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp > 0) return false;
    this.#die();
    return true;
  }

  kill() {
    if (this.dead) return false;
    this.#hp = 0;
    this.#die();
    return true;
  }

  #die() {
    this.dead = true;
    this.collidable = false;
    this.effects.clear();
    this.deaths += 1;
    this.respawnIn = SHIP.respawnDelay;
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

  applyPickup(type) {
    this.effects.set(type, EFFECT_DURATION[type]);
  }

  get state() {
    return { x: this.pos.x, y: this.pos.y, vx: this.vel.x, vy: this.vel.y, angle: this.angle };
  }

  fire(world, shot = 0) {
    const nose = this.pos.add(Vector2.fromAngle(this.angle, this.radius + 8));
    const vel = this.vel.add(Vector2.fromAngle(this.angle, BULLET.speed));
    const bullet = new Bullet({ pos: nose, vel, ownerId: this.id, shot });
    if (this.effects.has("homing")) {
      bullet.behaviors.push(homing({ targetKind: "ship", ignoreId: this.id, turnRate: 4 }));
    }
    world.spawn(bullet);
    world.emit("fired", { shipId: this.id, x: nose.x, y: nose.y });
    this.cooldown = this.effects.has("rapid") ? SHIP.rapidCooldown : SHIP.fireCooldown;
  }

  tick(dt, world) {
    for (const [type, left] of this.effects) {
      if (left - dt <= 0) this.effects.delete(type);
      else this.effects.set(type, left - dt);
    }
    if (!this.dead) return;
    this.respawnIn -= dt;
    if (this.respawnIn <= 0) this.respawn(world);
  }

  steer(controls, dt, world, shot = 0) {
    if (this.dead) return;
    const next = shipPhysics(this.state, controls, dt, wellFields(world));
    this.pos = new Vector2(next.x, next.y);
    this.vel = new Vector2(next.vx, next.vy);
    this.angle = next.angle;
    this.thrust = next.thrust;

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (controls.fire && this.cooldown === 0) this.fire(world, shot);
  }

  settle() {
    if (this.dead) return;
    const q = quantizeShip(this.state);
    this.pos = new Vector2(q.x, q.y);
    this.vel = new Vector2(q.vx, q.vy);
    this.angle = q.angle;
  }

  update(dt, world) {
    this.tick(dt, world);
    if (!this.inputDriven) this.steer(this.controls, dt, world);
  }
}
