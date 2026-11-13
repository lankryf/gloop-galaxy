import { outside } from "./arena.ts";
import { Entity } from "./entity.ts";
import type { Ship } from "./ship.ts";
import type { Vector2 } from "./vector.ts";
import type { World } from "./world.ts";

export const DUST = { radius: 7, ttl: 25, magnet: 220, pull: 1500, drag: 1.4, points: 10, heal: 5 };

export class Dust extends Entity {
  readonly kind = "dust";
  ttl: number = DUST.ttl;

  constructor({ pos, vel }: { pos: Vector2; vel: Vector2 }) {
    super({ pos, vel, radius: DUST.radius });
  }

  nearest(world: World): Ship | null {
    let best: Ship | null = null;
    let bestDistance: number = DUST.magnet;
    for (const ship of world.ofKind("ship")) {
      if (ship.dead) continue;
      const d = ship.pos.sub(this.pos).length();
      if (d < bestDistance) {
        bestDistance = d;
        best = ship;
      }
    }
    return best;
  }

  override update(dt: number, world: World): void {
    const ship = this.nearest(world);
    if (ship) {
      const to = ship.pos.sub(this.pos);
      const d = to.length() || 1;
      this.vel = this.vel.add(to.scale((DUST.pull * dt) / d));
    }
    this.vel = this.vel.scale(Math.max(0, 1 - DUST.drag * dt));
    super.update(dt, world);
    this.ttl -= dt;
    if (this.ttl <= 0 || outside(this.pos.x, this.pos.y, this.radius)) this.alive = false;
  }
}
