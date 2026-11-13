import type { ArenaSize } from "./arena.ts";
import { ARENA, inside, outside } from "./arena.ts";
import { homing } from "./behaviors.ts";
import { Entity } from "./entity.ts";
import type { Rng } from "./random.ts";
import { Vector2 } from "./vector.ts";
import { GravityWell } from "./well.ts";
import type { World } from "./world.ts";

export const ASTEROID_FIELD = { spawnGap: 40, lostAfter: 1400 };
export const FORMING = { radius: 75, time: 10, decay: 0.5 };

export function replaceAsteroid(world: World, delay = world.rng.range(0.5, 2.5)): void {
  world.later(delay, (w) => w.spawn(Asteroid.incoming(w.rng, ARENA)));
}

export class Asteroid extends Entity {
  readonly kind = "asteroid";
  readonly spin: number;
  readonly shape: readonly number[];
  hp: number;
  hunter = false;
  entered = false;
  fragment = false;
  age = 0;
  forming = 0;

  constructor({ pos, vel, radius, rng }: { pos: Vector2; vel: Vector2; radius: number; rng: Rng }) {
    super({ pos, vel, radius });
    this.spin = rng.range(-1.2, 1.2);
    this.hp = radius > 42 ? 3 : radius > 28 ? 2 : 1;
    this.shape = Array.from({ length: 11 }, () => rng.range(0.78, 1.12));
  }

  get formingProgress(): number {
    return Math.min(1, this.forming / FORMING.time);
  }

  shielded(world: World): boolean {
    for (const well of world.ofKind("well")) {
      if (well.pos.sub(this.pos).length() < well.range) return true;
    }
    return false;
  }

  form(dt: number, world: World): void {
    if (this.radius < FORMING.radius) {
      this.forming = 0;
      return;
    }
    if (this.shielded(world)) {
      this.forming = Math.max(0, this.forming - FORMING.decay * dt);
      return;
    }
    this.forming += dt;
    if (this.forming < FORMING.time) return;
    this.alive = false;
    world.spawn(new GravityWell({ type: "planet", pos: this.pos, radius: this.radius }));
    world.emit("formed", { x: this.pos.x, y: this.pos.y, radius: this.radius });
    if (!this.fragment) replaceAsteroid(world);
  }

  override update(dt: number, world: World): void {
    super.update(dt, world);
    this.angle += this.spin * dt;
    this.age += dt;
    this.form(dt, world);
    if (!this.alive) return;
    const { x, y } = this.pos;
    if (!this.entered && inside(x, y, this.radius)) this.entered = true;
    const gone = this.entered
      ? outside(x, y, this.radius)
      : outside(x, y, ASTEROID_FIELD.lostAfter);
    if (!gone) return;
    this.alive = false;
    if (!this.fragment) replaceAsteroid(world);
  }

  static incoming(rng: Rng, arena: ArenaSize, extraDistance = 0): Asteroid {
    const radius = rng.range(20, 55);
    const side = rng.int(0, 3);
    const away = radius + ASTEROID_FIELD.spawnGap + extraDistance;
    const along = rng.next();
    const pos =
      side === 0
        ? new Vector2(-away, along * arena.height)
        : side === 1
          ? new Vector2(arena.width + away, along * arena.height)
          : side === 2
            ? new Vector2(along * arena.width, -away)
            : new Vector2(along * arena.width, arena.height + away);
    const target = new Vector2(
      rng.range(0.15, 0.85) * arena.width,
      rng.range(0.15, 0.85) * arena.height,
    );
    const sizeFactor = Math.sqrt(36 / radius);
    const burst = rng.next() < 0.15 ? 1.8 : 1;
    const speed = rng.range(45, 150) * sizeFactor * burst;
    const vel = target.sub(pos).normalize().scale(speed);
    const asteroid = new Asteroid({ pos, vel, radius, rng });
    if (rng.next() < 0.2) {
      asteroid.hunter = true;
      asteroid.behaviors.push(homing({ turnRate: 0.6, range: 380 }));
    }
    return asteroid;
  }

  static random(rng: Rng, arena: ArenaSize, world: World | null = null): Asteroid {
    const radius = rng.range(20, 55);
    const spot = world?.findSafeSpot(radius, arena, 12);
    const pos = spot
      ? new Vector2(spot.x, spot.y)
      : new Vector2(rng.range(0, arena.width), rng.range(0, arena.height));
    const vel = Vector2.fromAngle(rng.range(0, Math.PI * 2), rng.range(25, 90));
    const asteroid = new Asteroid({ pos, vel, radius, rng });
    if (rng.next() < 0.2) {
      asteroid.hunter = true;
      asteroid.behaviors.push(homing({ turnRate: 0.6, range: 380 }));
    }
    return asteroid;
  }
}
