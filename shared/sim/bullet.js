import { Entity } from "./entity.js";

export const BULLET = { speed: 700, ttl: 1.1, radius: 5, damage: 25 };

export class Bullet extends Entity {
  constructor({ pos, vel, ownerId, shot = 0 }) {
    super({ kind: "bullet", pos, vel, angle: vel.angle(), radius: BULLET.radius });
    this.ownerId = ownerId;
    this.shot = shot;
    this.ttl = BULLET.ttl;
    this.damage = BULLET.damage;
  }

  update(dt) {
    super.update(dt);
    this.ttl -= dt;
    if (this.ttl <= 0) this.alive = false;
  }
}
