import type { Seq } from "../ids.ts";
import { seq } from "../ids.ts";
import { ARENA } from "./arena.ts";
import { homing } from "./behaviors.ts";
import { BULLET, Bullet } from "./bullet.ts";
import { Entity } from "./entity.ts";
import { cos, hypot, sin } from "./fmath.ts";
import type { WellField } from "./gravity.ts";
import { gravityAt, gravityFields } from "./gravity.ts";
import { MISSILE, Missile } from "./missile.ts";
import type { AbilityType, EffectType, PickupType } from "./pickup.ts";
import { EFFECT_DURATION, isAbility } from "./pickup.ts";
import { Vector2 } from "./vector.ts";
import type { World } from "./world.ts";

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
  wallBounce: 0.5,
};

export interface Controls {
  readonly thrust: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly fire: boolean;
  readonly use?: boolean;
}

export const IDLE: Controls = { thrust: false, left: false, right: false, fire: false, use: false };

export const WARP_DISTANCE = 900;
export const WARP_DELAY = 3;
export const BEAM_CHARGE = 5;

export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
}

export interface MovedShip extends ShipState {
  readonly thrust: boolean;
}

export function integrate(ship: ShipState, input: Controls, dt: number): MovedShip {
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

  x += vx * dt;
  y += vy * dt;
  const r = SHIP.radius;
  if (x < r) {
    x = r;
    if (vx < 0) vx = -vx * SHIP.wallBounce;
  } else if (x > ARENA.width - r) {
    x = ARENA.width - r;
    if (vx > 0) vx = -vx * SHIP.wallBounce;
  }
  if (y < r) {
    y = r;
    if (vy < 0) vy = -vy * SHIP.wallBounce;
  } else if (y > ARENA.height - r) {
    y = ARENA.height - r;
    if (vy > 0) vy = -vy * SHIP.wallBounce;
  }

  return { x, y, vx, vy, angle, thrust: input.thrust };
}

export function quantizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return Math.round(a * 10000) / 10000;
}

export function quantizeShip<T extends ShipState>(state: T): T {
  return {
    ...state,
    x: Math.fround(state.x),
    y: Math.fround(state.y),
    vx: Math.fround(state.vx),
    vy: Math.fround(state.vy),
    angle: quantizeAngle(state.angle),
  };
}

export function shipPhysics(
  state: ShipState,
  input: Controls,
  dt: number,
  wells: readonly WellField[],
): MovedShip {
  const moved = integrate(state, input, dt);
  if (wells.length === 0) return quantizeShip(moved);
  const { ax, ay } = gravityAt(moved.x, moved.y, wells);
  return quantizeShip({ ...moved, vx: moved.vx + ax * dt, vy: moved.vy + ay * dt });
}

export class Ship extends Entity {
  readonly kind = "ship";
  #hp = SHIP.maxHp;
  readonly name: string;
  readonly inputDriven: boolean;
  controls: Controls = IDLE;
  thrust = false;
  cooldown = 0;
  score = 0;
  deaths = 0;
  dead = false;
  respawnIn = 0;
  readonly effects = new Map<EffectType, number>();
  ability: AbilityType | null = null;
  charge = 0;
  beaming = false;
  warpIn = 0;
  #usedLast = false;

  constructor({
    pos,
    angle = -Math.PI / 2,
    name = "pilot",
    inputDriven = false,
  }: { pos: Vector2; angle?: number; name?: string; inputDriven?: boolean }) {
    super({ pos, angle: quantizeAngle(angle), radius: SHIP.radius });
    this.name = name;
    this.inputDriven = inputDriven;
  }

  get hp(): number {
    return this.#hp;
  }

  get state(): ShipState {
    return { x: this.pos.x, y: this.pos.y, vx: this.vel.x, vy: this.vel.y, angle: this.angle };
  }

  damage(amount: number): boolean {
    if (this.dead || this.effects.has("shield")) return false;
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp > 0) return false;
    this.#die();
    return true;
  }

  kill(): boolean {
    if (this.dead) return false;
    this.#hp = 0;
    this.#die();
    return true;
  }

  #die(): void {
    this.dead = true;
    this.collidable = false;
    this.effects.clear();
    this.beaming = false;
    this.warpIn = 0;
    this.deaths += 1;
    this.respawnIn = SHIP.respawnDelay;
  }

  respawn(world: World): void {
    const spot = world.findSafeSpot(this.radius, ARENA);
    this.pos = new Vector2(spot.x, spot.y);
    this.prevPos = this.pos;
    this.vel = new Vector2();
    this.#hp = SHIP.maxHp;
    this.dead = false;
    this.collidable = true;
  }

  applyPickup(type: PickupType): void {
    if (isAbility(type)) {
      this.ability = type;
      this.charge = type === "gravity" ? BEAM_CHARGE : 0;
    } else this.effects.set(type, EFFECT_DURATION[type]);
  }

  useAbility(world: World): void {
    const ability = this.ability;
    if (!ability || this.dead) return;
    this.ability = null;
    const dir = Vector2.fromAngle(this.angle, 1);
    const nose = this.pos.add(dir.scale(this.radius + 14));
    world.emit("ability", { shipId: this.id, ability, x: this.pos.x, y: this.pos.y });
    switch (ability) {
      case "missile":
        world.spawn(
          new Missile({
            pos: nose,
            vel: dir.scale(MISSILE.homing.speed),
            type: "homing",
            ownerId: this.id,
          }),
        );
        return;
      case "nuke":
        world.spawn(
          new Missile({
            pos: nose,
            vel: this.vel.scale(0.5).add(dir.scale(MISSILE.nuke.speed)),
            type: "nuke",
            ownerId: this.id,
          }),
        );
        return;
      case "gravity":
        return;
      case "warp":
        this.warpIn = WARP_DELAY;
        return;
      default: {
        const never: never = ability;
        throw new Error(`Unknown ability ${String(never)}`);
      }
    }
  }

  fire(world: World, shot: Seq = seq(0)): void {
    const nose = this.pos.add(Vector2.fromAngle(this.angle, this.radius + 8));
    const vel = this.vel.add(Vector2.fromAngle(this.angle, BULLET.speed));
    const bullet = new Bullet({ pos: nose, vel, ownerId: this.id, shot });
    if (this.effects.has("homing")) {
      bullet.behaviors.push(homing({ ignoreId: this.id, turnRate: 4 }));
    }
    world.spawn(bullet);
    world.emit("fired", { shipId: this.id, x: nose.x, y: nose.y });
    this.cooldown = this.effects.has("rapid") ? SHIP.rapidCooldown : SHIP.fireCooldown;
  }

  tick(dt: number, world: World): void {
    for (const [type, left] of this.effects) {
      if (left - dt <= 0) this.effects.delete(type);
      else this.effects.set(type, left - dt);
    }
    if (!this.dead) return;
    this.respawnIn -= dt;
    if (this.respawnIn <= 0) this.respawn(world);
  }

  steer(controls: Controls, dt: number, world: World, shot: Seq = seq(0)): void {
    if (this.dead) return;
    const next = shipPhysics(this.state, controls, dt, gravityFields(world, this));
    this.pos = new Vector2(next.x, next.y);
    this.vel = new Vector2(next.vx, next.vy);
    this.angle = next.angle;
    this.thrust = next.thrust;

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (controls.fire && this.cooldown === 0) this.fire(world, shot);
    const use = controls.use === true;
    this.beaming = false;
    if (this.warpIn > 0) {
      this.warpIn = Math.max(0, this.warpIn - dt);
      if (this.warpIn === 0) this.warp(world);
    } else if (this.ability === "gravity") this.holdBeam(use, dt, world);
    else if (use && !this.#usedLast) this.useAbility(world);
    this.#usedLast = use;
  }

  holdBeam(use: boolean, dt: number, world: World): void {
    this.beaming = use && this.charge > 0;
    if (!this.beaming) return;
    if (!this.#usedLast)
      world.emit("ability", { shipId: this.id, ability: "gravity", x: this.pos.x, y: this.pos.y });
    this.charge = Math.max(0, this.charge - dt);
    if (this.charge > 0) return;
    this.ability = null;
  }

  warp(world: World): void {
    const r = this.radius;
    const to = this.pos.add(Vector2.fromAngle(this.angle, WARP_DISTANCE));
    world.emit("warped", { shipId: this.id, x: this.pos.x, y: this.pos.y, arrive: false });
    this.pos = new Vector2(
      Math.min(ARENA.width - r, Math.max(r, to.x)),
      Math.min(ARENA.height - r, Math.max(r, to.y)),
    );
    this.prevPos = this.pos;
    world.emit("warped", { shipId: this.id, x: this.pos.x, y: this.pos.y, arrive: true });
  }

  override settle(): void {
    if (this.dead) return;
    const q = quantizeShip(this.state);
    this.pos = new Vector2(q.x, q.y);
    this.vel = new Vector2(q.vx, q.vy);
    this.angle = q.angle;
  }

  override update(dt: number, world: World): void {
    this.tick(dt, world);
    if (!this.inputDriven) this.steer(this.controls, dt, world);
  }
}
