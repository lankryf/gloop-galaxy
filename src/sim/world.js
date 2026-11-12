import { findCollisions } from "./collision.js";
import { createRng } from "./random.js";
import { resolveCollisions } from "./rules.js";

export class World {
  #entities = new Map();
  #pending = [];
  #stepping = false;

  constructor({ seed = 1, detect = findCollisions } = {}) {
    this.rng = createRng(seed);
    this.time = 0;
    this.detect = detect;
    this.timers = [];
  }

  later(delay, action) {
    this.timers.push({ at: this.time + delay, action });
  }

  spawn(entity) {
    if (this.#stepping) this.#pending.push(entity);
    else this.#entities.set(entity.id, entity);
    return entity;
  }

  despawn(id) {
    const entity = this.#entities.get(id);
    if (entity) entity.alive = false;
  }

  get(id) {
    return this.#entities.get(id);
  }

  get size() {
    return this.#entities.size;
  }

  *[Symbol.iterator]() {
    yield* this.#entities.values();
  }

  *ofKind(kind) {
    for (const entity of this.#entities.values()) {
      if (entity.kind === kind && entity.alive) yield entity;
    }
  }

  step(dt) {
    this.#stepping = true;
    for (const entity of this.#entities.values()) entity.remember();
    for (const entity of this.#entities.values()) {
      if (!entity.alive) continue;
      entity.update(dt, this);
      for (const behavior of entity.behaviors) behavior(entity, this, dt);
    }
    resolveCollisions(this, this.detect(this.#entities.values()));
    this.#sweep();
    this.#stepping = false;
    for (const entity of this.#pending) this.#entities.set(entity.id, entity);
    this.#pending.length = 0;
    this.time += dt;
    this.#runTimers();
  }

  #runTimers() {
    if (this.timers.length === 0) return;
    const due = this.timers.filter((t) => t.at <= this.time);
    if (due.length === 0) return;
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.action(this);
  }

  findSafeSpot(radius, arena, tries = 30) {
    let best = null;
    let bestDistance = -1;
    for (let i = 0; i < tries; i++) {
      const x = this.rng.range(radius, arena.width - radius);
      const y = this.rng.range(radius, arena.height - radius);
      let nearest = Number.POSITIVE_INFINITY;
      for (const e of this.#entities.values()) {
        if (!e.collidable || !e.alive) continue;
        const d = Math.hypot(e.pos.x - x, e.pos.y - y) - e.radius;
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = { x, y };
      }
      if (nearest > radius * 6) break;
    }
    return best;
  }

  #sweep() {
    for (const [id, entity] of this.#entities) {
      if (!entity.alive) this.#entities.delete(id);
    }
  }
}
