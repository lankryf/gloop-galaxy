import { Entity } from "./entity.ts";
import { cos, sin } from "./fmath.ts";
import type { Rng } from "./random.ts";
import type { Vector2 } from "./vector.ts";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface ExplosionInit {
  readonly pos: Vector2;
  readonly rng: Rng;
  readonly size?: number;
  readonly color?: string;
}

export class Explosion extends Entity {
  readonly kind = "explosion";
  readonly duration = 0.9;
  readonly particles: Particle[] = [];
  color = "#8dff3a";
  ttl = 0.9;
  count = 0;

  constructor(init: ExplosionInit) {
    super({ pos: init.pos });
    this.reset(init);
  }

  reset({ pos, rng, size = 1, color = "#8dff3a" }: ExplosionInit): this {
    this.pos = pos;
    this.color = color;
    this.ttl = this.duration;
    this.alive = true;
    this.count = Math.round(18 * size);
    while (this.particles.length < this.count)
      this.particles.push({ x: 0, y: 0, vx: 0, vy: 0, r: 0 });
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      if (!p) continue;
      const angle = rng.range(0, Math.PI * 2);
      const speed = rng.range(40, 220) * size;
      p.x = pos.x;
      p.y = pos.y;
      p.vx = cos(angle) * speed;
      p.vy = sin(angle) * speed;
      p.r = rng.range(2, 6) * size;
    }
    return this;
  }

  override update(dt: number): void {
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.alive = false;
      return;
    }
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      if (!p) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
  }
}
