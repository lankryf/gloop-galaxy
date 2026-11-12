import type { ArenaSize } from "./arena.ts";
import { Entity } from "./entity.ts";
import { Vector2 } from "./vector.ts";
import type { World } from "./world.ts";

export const PICKUP_TYPES: readonly ["shield", "rapid", "homing"] = ["shield", "rapid", "homing"];
export type PickupType = (typeof PICKUP_TYPES)[number];
export const EFFECT_DURATION: Readonly<Record<PickupType, number>> = {
  shield: 6,
  rapid: 8,
  homing: 8,
};

export class Pickup extends Entity {
  readonly kind = "pickup";
  readonly type: PickupType;
  age = 0;

  constructor({ pos, type }: { pos: Vector2; type: PickupType }) {
    super({ pos, radius: 18 });
    this.type = type;
  }

  override update(dt: number): void {
    this.age += dt;
  }

  static random(world: World, arena: ArenaSize): Pickup {
    const spot = world.findSafeSpot(18, arena);
    return new Pickup({ pos: new Vector2(spot.x, spot.y), type: world.rng.pick(PICKUP_TYPES) });
  }
}
