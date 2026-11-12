import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Explosion extends Entity {
  constructor({ pos, rng, size = 1, color = "#8dff3a" }) {
    super({ kind: "explosion", pos });
    this.ttl = 0.9;
    this.duration = this.ttl;
    this.color = color;
    const count = Math.round(18 * size);
    this.particles = Array.from({ length: count }, () => ({
      pos: pos,
      vel: Vector2.fromAngle(rng.range(0, Math.PI * 2), rng.range(40, 220) * size),
      r: rng.range(2, 6) * size,
    }));
  }

  update(dt) {
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.alive = false;
      return;
    }
    for (const p of this.particles) {
      p.pos = p.pos.add(p.vel.scale(dt));
      p.vel = p.vel.scale(0.94);
    }
  }
}
