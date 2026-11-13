import { Bus } from "../bus.ts";
import type { EntityId } from "../ids.ts";
import { isEntityId } from "../ids.ts";
import type { ArenaSize } from "./arena.ts";
import type { CollisionDetector } from "./collision.ts";
import { findCollisions } from "./collision.ts";
import { hypot } from "./fmath.ts";
import { applyGravity } from "./gravity.ts";
import type { AnyEntity, EntityKind, OfKind } from "./kinds.ts";
import { isKind } from "./kinds.ts";
import type { AbilityType, PickupType } from "./pickup.ts";
import type { Rng } from "./random.ts";
import { createRng } from "./random.ts";
import { resolveCollisions } from "./rules.ts";
import type { Point } from "./vector.ts";

export type WorldEvents = {
  ability: {
    readonly shipId: EntityId;
    readonly ability: AbilityType;
    readonly x: number;
    readonly y: number;
  };
  fired: { readonly shipId: EntityId; readonly x: number; readonly y: number };
  hit: {
    readonly x: number;
    readonly y: number;
    readonly target: "asteroid" | "ship";
    readonly shipId?: EntityId;
    readonly ownerId?: EntityId;
  };
  exploded: { readonly x: number; readonly y: number; readonly size: number };
  scored: {
    readonly shipId: EntityId;
    readonly points: number;
    readonly x: number;
    readonly y: number;
  };
  pickup: {
    readonly shipId: EntityId;
    readonly type: PickupType;
    readonly x: number;
    readonly y: number;
  };
  swallowed: {
    readonly x: number;
    readonly y: number;
    readonly kind: "bullet" | "asteroid" | "ship";
    readonly shipId?: EntityId;
  };
  collapsed: { readonly x: number; readonly y: number };
};

export type WorldSystem = (world: World, dt: number) => void;

interface Timer {
  readonly at: number;
  readonly action: (world: World) => void;
}

export class World {
  #entities = new Map<EntityId, AnyEntity>();
  #pending: AnyEntity[] = [];
  #stepping = false;
  #nextId = 1;
  readonly events = new Bus<WorldEvents>();
  readonly rng: Rng;
  readonly detect: CollisionDetector;
  readonly systems: readonly WorldSystem[];
  time = 0;
  timers: Timer[] = [];

  constructor({
    seed = 1,
    detect = findCollisions,
    systems = [applyGravity],
  }: { seed?: number; detect?: CollisionDetector; systems?: readonly WorldSystem[] } = {}) {
    this.rng = createRng(seed);
    this.detect = detect;
    this.systems = systems;
  }

  later(delay: number, action: (world: World) => void): void {
    this.timers.push({ at: this.time + delay, action });
  }

  emit<K extends keyof WorldEvents>(type: K, detail: WorldEvents[K]): void {
    this.events.emit(type, detail);
  }

  #allocateId(): EntityId {
    for (let i = 0; i < 0xffff; i++) {
      const id = this.#nextId;
      this.#nextId = this.#nextId >= 0xffff ? 1 : this.#nextId + 1;
      if (!isEntityId(id)) continue;
      if (!this.#entities.has(id) && !this.#pending.some((e) => e.id === id)) return id;
    }
    throw new Error("No free entity ids");
  }

  spawn<T extends AnyEntity>(entity: T): T {
    if (!entity.hasId) entity.assignId(this.#allocateId());
    if (this.#stepping) this.#pending.push(entity);
    else this.#entities.set(entity.id, entity);
    return entity;
  }

  despawn(id: EntityId): void {
    const entity = this.#entities.get(id);
    if (entity) entity.alive = false;
  }

  get(id: EntityId): AnyEntity | undefined {
    return this.#entities.get(id);
  }

  get size(): number {
    return this.#entities.size;
  }

  *[Symbol.iterator](): Generator<AnyEntity> {
    yield* this.#entities.values();
  }

  *ofKind<K extends EntityKind>(kind: K): Generator<OfKind<K>> {
    for (const entity of this.#entities.values()) {
      if (isKind(entity, kind) && entity.alive) yield entity;
    }
  }

  step(dt: number): void {
    this.#stepping = true;
    for (const entity of this.#entities.values()) entity.remember();
    for (const entity of this.#entities.values()) {
      if (!entity.alive) continue;
      entity.update(dt, this);
      for (const behavior of entity.behaviors) behavior(entity, this, dt);
    }
    for (const system of this.systems) system(this, dt);
    resolveCollisions(this, this.detect(this.#entities.values()));
    for (const entity of this.#entities.values()) entity.settle();
    this.#sweep();
    this.#stepping = false;
    for (const entity of this.#pending) this.#entities.set(entity.id, entity);
    this.#pending.length = 0;
    this.time += dt;
    this.#runTimers();
  }

  #runTimers(): void {
    if (this.timers.length === 0) return;
    const due = this.timers.filter((t) => t.at <= this.time);
    if (due.length === 0) return;
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.action(this);
  }

  findSafeSpot(radius: number, arena: ArenaSize, tries = 30): Point {
    let best: Point | null = null;
    let bestDistance = -1;
    for (let i = 0; i < tries; i++) {
      const x = this.rng.range(radius, arena.width - radius);
      const y = this.rng.range(radius, arena.height - radius);
      let nearest = Number.POSITIVE_INFINITY;
      for (const e of this.#entities.values()) {
        if (!e.collidable || !e.alive) continue;
        const reach = e.kind === "well" ? e.range * 0.6 : e.radius;
        const d = hypot(e.pos.x - x, e.pos.y - y) - reach;
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = { x, y };
      }
      if (nearest > radius * 6) break;
    }
    return best ?? { x: arena.width / 2, y: arena.height / 2 };
  }

  #sweep(): void {
    for (const [id, entity] of this.#entities) {
      if (!entity.alive) this.#entities.delete(id);
    }
  }
}
