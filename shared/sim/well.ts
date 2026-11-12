import type { ArenaSize } from "./arena.ts";
import { ARENA } from "./arena.ts";
import { Entity } from "./entity.ts";
import type { WellField } from "./gravity.ts";
import { Vector2 } from "./vector.ts";
import type { World } from "./world.ts";

export const WELL_TYPES: readonly ["blackhole", "planet"] = ["blackhole", "planet"];
export type WellType = (typeof WELL_TYPES)[number];

export interface WellConfig {
  readonly radius: number;
  readonly range: number;
  readonly strength: number;
  readonly solid: boolean;
  readonly life: number;
  readonly spin: number;
}

export const WELLS: Readonly<Record<WellType, WellConfig>> = {
  blackhole: { radius: 26, range: 460, strength: 1.2e7, solid: false, life: 30, spin: 2.5 },
  planet: {
    radius: 64,
    range: 340,
    strength: 4e6,
    solid: true,
    life: Number.POSITIVE_INFINITY,
    spin: 0.08,
  },
};

export interface WellPlacement {
  readonly type: WellType;
  readonly x: number;
  readonly y: number;
  readonly drift?: readonly [number, number];
}

export class GravityWell extends Entity {
  readonly kind = "well";
  readonly type: WellType;
  readonly range: number;
  readonly strength: number;
  readonly solid: boolean;
  readonly life: number;
  readonly spin: number;
  age = 0;

  constructor({ pos, vel = new Vector2(), type }: { pos: Vector2; vel?: Vector2; type: WellType }) {
    const config = WELLS[type];
    super({ pos, vel, radius: config.radius });
    this.type = type;
    this.range = config.range;
    this.strength = config.strength;
    this.solid = config.solid;
    this.life = config.life;
    this.spin = config.spin;
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

  get timeLeft(): number {
    return this.life - this.age;
  }

  override update(dt: number, world: World): void {
    super.update(dt, world);
    this.angle += this.spin * dt;
    this.age += dt;
    if (this.age < this.life) return;
    this.alive = false;
    world.emit("collapsed", { x: this.pos.x, y: this.pos.y });
    world.later(4, (w) => w.spawn(GravityWell.drifting(w)));
  }

  static fromConfig(
    { type, x, y, drift = [0, 0] }: WellPlacement,
    arena: ArenaSize = ARENA,
  ): GravityWell {
    return new GravityWell({
      type,
      pos: new Vector2(x * arena.width, y * arena.height),
      vel: new Vector2(drift[0], drift[1]),
    });
  }

  static drifting(world: World, arena: ArenaSize = ARENA): GravityWell {
    const spot = world.findSafeSpot(WELLS.blackhole.range * 0.4, arena);
    const vel = Vector2.fromAngle(world.rng.range(0, Math.PI * 2), world.rng.range(8, 22));
    return new GravityWell({ type: "blackhole", pos: new Vector2(spot.x, spot.y), vel });
  }
}
