import type { ArenaSize } from "./arena.ts";
import { ARENA, inside, outside } from "./arena.ts";
import { Entity } from "./entity.ts";
import type { WellField } from "./gravity.ts";
import type { Rng } from "./random.ts";
import { Vector2 } from "./vector.ts";
import type { World } from "./world.ts";

export const WELL_TYPES: readonly ["blackhole", "planet"] = ["blackhole", "planet"];
export type WellType = (typeof WELL_TYPES)[number];

export interface WellConfig {
  readonly radius: number;
  readonly range: number;
  readonly strength: number;
  readonly solid: boolean;
  readonly spin: number;
  readonly capacity: number;
}

export const WELLS: Readonly<Record<WellType, WellConfig>> = {
  blackhole: { radius: 40, range: 640, strength: 2.4e7, solid: false, spin: 2.5, capacity: 100 },
  planet: { radius: 170, range: 780, strength: 2.8e7, solid: true, spin: 0.03, capacity: 0 },
};

export const BLACK_HOLE = {
  spawnGap: 120,
  lostAfter: 2400,
  minSpeed: 25,
  maxSpeed: 60,
  respawn: 8,
};

export interface PlanetPlacement {
  readonly x: number;
  readonly y: number;
}

export class GravityWell extends Entity {
  readonly kind = "well";
  readonly type: WellType;
  readonly range: number;
  readonly strength: number;
  readonly solid: boolean;
  readonly spin: number;
  readonly capacity: number;
  mass = 0;
  entered = false;

  home: Vector2 | null = null;

  constructor({
    pos,
    vel = new Vector2(),
    type,
    radius,
  }: {
    pos: Vector2;
    vel?: Vector2;
    type: WellType;
    radius?: number;
  }) {
    const config = WELLS[type];
    const size = radius ?? config.radius;
    const k = size / config.radius;
    super({ pos, vel, radius: size });
    this.type = type;
    this.range = config.range * k;
    this.strength = config.strength * k * k * k;
    this.solid = config.solid;
    this.spin = config.spin;
    this.capacity = config.capacity;
  }

  get field(): WellField {
    return {
      x: this.pos.x,
      y: this.pos.y,
      radius: this.radius,
      range: this.range,
      strength: this.strength,
    };
  }

  get full(): boolean {
    return this.capacity > 0 && this.mass >= this.capacity;
  }

  override update(dt: number, world: World): void {
    super.update(dt, world);
    this.angle += this.spin * dt;
    if (this.type !== "blackhole") return;
    const { x, y } = this.pos;
    if (!this.entered && inside(x, y, this.radius)) this.entered = true;
    const gone = this.entered
      ? outside(x, y, this.radius * 3)
      : outside(x, y, BLACK_HOLE.lostAfter);
    if (!gone) return;
    this.alive = false;
    world.later(BLACK_HOLE.respawn, (w) => w.spawn(GravityWell.incoming(w.rng, ARENA)));
  }

  static planet({ x, y }: PlanetPlacement, arena: ArenaSize = ARENA): GravityWell {
    const pos = new Vector2(x * arena.width, y * arena.height);
    const planet = new GravityWell({ type: "planet", pos });
    planet.home = pos;
    return planet;
  }

  static incoming(rng: Rng, arena: ArenaSize = ARENA, extraDistance = 0): GravityWell {
    const away = WELLS.blackhole.radius + BLACK_HOLE.spawnGap + extraDistance;
    const side = rng.int(0, 3);
    const along = rng.range(0.1, 0.9);
    const pos =
      side === 0
        ? new Vector2(-away, along * arena.height)
        : side === 1
          ? new Vector2(arena.width + away, along * arena.height)
          : side === 2
            ? new Vector2(along * arena.width, -away)
            : new Vector2(along * arena.width, arena.height + away);
    const target = new Vector2(
      rng.range(0.25, 0.75) * arena.width,
      rng.range(0.25, 0.75) * arena.height,
    );
    const speed = rng.range(BLACK_HOLE.minSpeed, BLACK_HOLE.maxSpeed);
    return new GravityWell({
      type: "blackhole",
      pos,
      vel: target.sub(pos).normalize().scale(speed),
    });
  }
}
