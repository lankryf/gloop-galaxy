import { findCollisions } from "./collision.js";
import { hypot } from "./fmath.js";
import { applyGravity } from "./gravity.js";
import { createRng } from "./random.js";
import { resolveCollisions } from "./rules.js";

export class World extends EventTarget {
  #entities = new Map();
  #pending = [];
  #stepping = false;
  #nextId = 1;

  constructor({ seed = 1, detect = findCollisions, systems = [applyGravity] } = {}) {
    super();
    this.rng = createRng(seed);
    this.time = 0;
    this.detect = detect;
    this.systems = systems;
    this.timers = [];
  }

  later(delay, action) {
    this.timers.push({ at: this.time + delay, action });
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  #allocateId() {
    for (let i = 0; i < 0xffff; i++) {
      const id = this.#nextId;
      this.#nextId = this.#nextId >= 0xffff ? 1 : this.#nextId + 1;
      if (!this.#entities.has(id) && !this.#pending.some((e) => e.id === id)) return id;
    }
    throw new Error("No free entity ids");
  }

  spawn(entity) {
    if (entity.id === 0) entity.assignId(this.#allocateId());
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
    for (const system of this.systems) system(this, dt);
    resolveCollisions(this, this.detect(this.#entities.values()));
    for (const entity of this.#entities.values()) entity.settle?.();
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
        const reach = e.range ? e.range * 0.6 : e.radius;
        const d = hypot(e.pos.x - x, e.pos.y - y) - reach;
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
