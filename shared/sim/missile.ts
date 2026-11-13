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
  homing: {
    speed: 640,
    turnRate: 1.1,
    ttl: 5,
    radius: 10,
    blast: 130,
    damage: 70,
    seek: 1600,
    cone: 0.6,
  },
  nuke: {
    speed: 300,
    turnRate: 0,
    ttl: 1.6,
    radius: 16,
    blast: 460,
    damage: 130,
    seek: 0,
    cone: 0,
  },
} as const;

export class Missile extends Entity {
  readonly kind = "missile";
  readonly type: MissileType;
  readonly ownerId: EntityId;
  ttl: number;
  lockedOn: EntityId | null = null;
  lost = false;

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

  inSight(ship: Ship): boolean {
    const to = ship.pos.sub(this.pos);
    if (to.length() > MISSILE[this.type].seek) return false;
    let diff = to.angle() - this.vel.angle();
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= MISSILE[this.type].cone;
  }

  target(world: World): Ship | null {
    if (this.lost) return null;
    if (this.lockedOn !== null) {
      const locked = world.get(this.lockedOn);
      if (locked?.kind === "ship" && !locked.dead && this.inSight(locked)) return locked;
      this.lost = true;
      return null;
    }
    let best: Ship | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const ship of world.ofKind("ship")) {
      if (ship.dead || ship.id === this.ownerId || !this.inSight(ship)) continue;
      const d = ship.pos.sub(this.pos).length();
      if (d < bestDistance) {
        bestDistance = d;
        best = ship;
      }
    }
    if (best) this.lockedOn = best.id;
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
