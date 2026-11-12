import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export const PICKUP_TYPES = ["shield", "rapid", "homing"];
export const EFFECT_DURATION = { shield: 6, rapid: 8, homing: 8 };

export class Pickup extends Entity {
  constructor({ pos, type }) {
    super({ kind: "pickup", pos, radius: 18 });
    this.type = type;
    this.age = 0;
  }

  update(dt) {
    this.age += dt;
  }

  static random(world, arena) {
    const spot = world.findSafeSpot(18, arena);
    return new Pickup({ pos: new Vector2(spot.x, spot.y), type: world.rng.pick(PICKUP_TYPES) });
  }
}
