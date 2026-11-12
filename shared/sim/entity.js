import { ARENA, wrap } from "./arena.js";
import { Vector2 } from "./vector.js";

export class Entity {
  #id = 0;

  constructor({ kind, pos = new Vector2(), vel = new Vector2(), angle = 0, radius = 0, id = 0 }) {
    this.#id = id;
    this.kind = kind;
    this.pos = pos;
    this.vel = vel;
    this.angle = angle;
    this.radius = radius;
    this.alive = true;
    this.collidable = radius > 0;
    this.prevPos = pos;
    this.prevAngle = angle;
    this.behaviors = [];
  }

  get id() {
    return this.#id;
  }

  assignId(id) {
    if (this.#id !== 0) throw new Error(`Entity already has id ${this.#id}`);
    this.#id = id;
  }

  remember() {
    this.prevPos = this.pos;
    this.prevAngle = this.angle;
  }

  update(dt) {
    const next = this.pos.add(this.vel.scale(dt));
    this.pos = new Vector2(wrap(next.x, ARENA.width), wrap(next.y, ARENA.height));
  }
}
