import type { ArenaSize } from "./arena.ts";
import { Entity } from "./entity.ts";
import { Vector2 } from "./vector.ts";
import type { World } from "./world.ts";

export const EFFECT_TYPES: readonly ["shield", "rapid"] = ["shield", "rapid"];
export type EffectType = (typeof EFFECT_TYPES)[number];

export const ABILITY_TYPES: readonly ["missile", "nuke", "gravity", "warp", "radiator"] = [
  "missile",
  "nuke",
  "gravity",
  "warp",
  "radiator",
];
export type AbilityType = (typeof ABILITY_TYPES)[number];

export const PICKUP_TYPES: readonly [
  "shield",
  "rapid",
  "missile",
  "nuke",
  "gravity",
  "warp",
  "radiator",
] = ["shield", "rapid", "missile", "nuke", "gravity", "warp", "radiator"];
export type PickupType = (typeof PICKUP_TYPES)[number];

export const EFFECT_DURATION: Readonly<Record<EffectType, number>> = {
  shield: 6,
  rapid: 8,
};

export function isAbility(type: PickupType): type is AbilityType {
  return ABILITY_TYPES.some((a) => a === type);
}

export class Pickup extends Entity {
  readonly kind = "pickup";
  readonly type: PickupType;
  age = 0;

  constructor({ pos, type }: { pos: Vector2; type: PickupType }) {
    super({ pos, radius: 18 });
    this.type = type;
  }

  override update(dt: number, world: World): void {
    this.age += dt;
    if (this.vel.x === 0 && this.vel.y === 0) return;
    super.update(dt, world);
    this.vel = this.vel.scale(Math.max(0, 1 - 1.5 * dt));
    if (Math.abs(this.vel.x) + Math.abs(this.vel.y) < 1) this.vel = new Vector2();
  }

  static random(world: World, arena: ArenaSize): Pickup {
    const spot = world.findSafeSpot(18, arena);
    return new Pickup({ pos: new Vector2(spot.x, spot.y), type: world.rng.pick(PICKUP_TYPES) });
  }
}
