import type { EntityId } from "../ids.ts";
import { outside } from "./arena.ts";
import { Entity } from "./entity.ts";
import { detonate } from "./rules.ts";
import type { Ship } from "./ship.ts";
import { Vector2 } from "./vector.ts";
import type { World } from "./world.ts";

export const MISSILE_TYPES: readonly ["homing", "nuke"] = ["homing", "nuke"];
export type MissileType = (typeof MISSILE_TYPES)[number];

export const MISSILE = {
  homing: { speed: 520, turnRate: 3.4, ttl: 4, radius: 10, blast: 130, damage: 70, seek: 1600 },
  nuke: { speed: 300, turnRate: 0, ttl: 1.6, radius: 16, blast: 460, damage: 130, seek: 0 },
} as const;

export class Missile extends Entity {
  readonly kind = "missile";
  readonly type: MissileType;
  readonly ownerId: EntityId;
  ttl: number;

  constructor({
    pos,
    vel,
    type,
    ownerId,
  }: { pos: Vector2; vel: Vector2; type: MissileType; ownerId: EntityId }) {
    super({ pos, vel, angle: vel.angle(), radius: MISSILE[type].radius });
    this.type = type;
    this.ownerId = ownerId;
    this.ttl = MISSILE[type].ttl;
  }

  target(world: World): Ship | null {
    let best: Ship | null = null;
    let bestDistance: number = MISSILE[this.type].seek;
    for (const ship of world.ofKind("ship")) {
      if (ship.dead || ship.id === this.ownerId) continue;
      const d = ship.pos.sub(this.pos).length();
      if (d < bestDistance) {
        bestDistance = d;
        best = ship;
      }
    }
    return best;
  }

  override update(dt: number, world: World): void {
    const config = MISSILE[this.type];
    if (config.turnRate > 0) {
      const target = this.target(world);
      if (target) {
        const current = this.vel.angle();
        let diff = target.pos.sub(this.pos).angle() - current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-config.turnRate * dt, Math.min(config.turnRate * dt, diff));
        this.vel = Vector2.fromAngle(current + turn, config.speed);
      }
    }
    super.update(dt, world);
    this.angle = this.vel.angle();
    this.ttl -= dt;
    if (outside(this.pos.x, this.pos.y, this.radius)) {
      this.alive = false;
      return;
    }
    if (this.ttl <= 0) detonate(world, this);
  }
}
