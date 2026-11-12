import { Entity } from "./entity.ts";
import type { Rng } from "./random.ts";
import { Vector2 } from "./vector.ts";

export interface Particle {
  pos: Vector2;
  vel: Vector2;
  readonly r: number;
}

export class Explosion extends Entity {
  readonly kind = "explosion";
  readonly duration = 0.9;
  readonly color: string;
  readonly particles: Particle[];
  ttl = 0.9;

  constructor({
    pos,
    rng,
    size = 1,
    color = "#8dff3a",
  }: { pos: Vector2; rng: Rng; size?: number; color?: string }) {
    super({ pos });
    this.color = color;
    const count = Math.round(18 * size);
    this.particles = Array.from({ length: count }, () => ({
      pos,
      vel: Vector2.fromAngle(rng.range(0, Math.PI * 2), rng.range(40, 220) * size),
      r: rng.range(2, 6) * size,
    }));
  }

  override update(dt: number): void {
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
