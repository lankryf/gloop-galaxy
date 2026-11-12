import { createRng } from "./random.js";

export class World {
  #entities = new Map();
  #pending = [];
  #stepping = false;

  constructor({ seed = 1 } = {}) {
    this.rng = createRng(seed);
    this.time = 0;
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
      if (entity.alive) entity.update(dt, this);
    }
    this.#sweep();
    this.#stepping = false;
    for (const entity of this.#pending) this.#entities.set(entity.id, entity);
    this.#pending.length = 0;
    this.time += dt;
  }

  #sweep() {
    for (const [id, entity] of this.#entities) {
      if (!entity.alive) this.#entities.delete(id);
    }
  }
}
