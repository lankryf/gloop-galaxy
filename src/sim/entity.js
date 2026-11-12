import { ARENA, wrap } from "./arena.js";
import { Vector2 } from "./vector.js";

export class Entity {
  static #nextId = 1;
  #id;

  constructor({ kind, pos = new Vector2(), vel = new Vector2(), angle = 0, radius = 0 }) {
    this.#id = Entity.#nextId++;
    this.kind = kind;
    this.pos = pos;
    this.vel = vel;
    this.angle = angle;
    this.radius = radius;
    this.alive = true;
    this.collidable = radius > 0;
    this.prevPos = pos;
    this.prevAngle = angle;
  }

  get id() {
    return this.#id;
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
