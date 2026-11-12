import type { EntityId, Seq } from "../ids.ts";
import { seq } from "../ids.ts";
import { Entity } from "./entity.ts";
import type { Vector2 } from "./vector.ts";
import type { World } from "./world.ts";

export const BULLET = { speed: 700, ttl: 1.1, radius: 5, damage: 25 };

export class Bullet extends Entity {
  readonly kind = "bullet";
  readonly ownerId: EntityId;
  readonly shot: Seq;
  readonly damage = BULLET.damage;
  ttl = BULLET.ttl;

  constructor({
    pos,
    vel,
    ownerId,
    shot = seq(0),
  }: { pos: Vector2; vel: Vector2; ownerId: EntityId; shot?: Seq }) {
    super({ pos, vel, angle: vel.angle(), radius: BULLET.radius });
    this.ownerId = ownerId;
    this.shot = shot;
  }

  override update(dt: number, world: World): void {
    super.update(dt, world);
    this.ttl -= dt;
    if (this.ttl <= 0) this.alive = false;
  }
}
