import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Asteroid extends Entity {
  constructor({ pos, vel, radius, rng }) {
    super({ kind: "asteroid", pos, vel, radius });
    this.spin = rng.range(-1.2, 1.2);
    this.hp = radius > 42 ? 3 : radius > 28 ? 2 : 1;
    this.shape = Array.from({ length: 11 }, () => rng.range(0.78, 1.12));
  }

  update(dt) {
    super.update(dt);
    this.angle += this.spin * dt;
  }

  static random(rng, arena) {
    const radius = rng.range(20, 55);
    const pos = new Vector2(rng.range(0, arena.width), rng.range(0, arena.height));
    const vel = Vector2.fromAngle(rng.range(0, Math.PI * 2), rng.range(25, 90));
    return new Asteroid({ pos, vel, radius, rng });
  }
}
