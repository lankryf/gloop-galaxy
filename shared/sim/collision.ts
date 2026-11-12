import type { AnyEntity } from "./kinds.ts";

export type Pair = readonly [AnyEntity, AnyEntity];
export type CollisionDetector = (entities: Iterable<AnyEntity>) => Pair[];

export const findCollisions: CollisionDetector = (entities) => {
  const list: AnyEntity[] = [];
  for (const e of entities) {
    if (e.alive && e.collidable) list.push(e);
  }
  const pairs: Pair[] = [];
  list.forEach((a, i) => {
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b) continue;
      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      const r = a.radius + b.radius;
      if (dx * dx + dy * dy < r * r) pairs.push([a, b]);
    }
  });
  return pairs;
};
