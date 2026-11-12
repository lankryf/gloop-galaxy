import type { AnyEntity } from "./kinds.ts";

export type Pair = readonly [AnyEntity, AnyEntity];
export type CollisionDetector = (entities: Iterable<AnyEntity>) => Pair[];

function collidable(entities: Iterable<AnyEntity>): AnyEntity[] {
  const list: AnyEntity[] = [];
  for (const e of entities) {
    if (e.alive && e.collidable) list.push(e);
  }
  return list;
}

function overlaps(a: AnyEntity, b: AnyEntity): boolean {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}

export const bruteForce: CollisionDetector = (entities) => {
  const list = collidable(entities);
  const pairs: Pair[] = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b && overlaps(a, b)) pairs.push([a, b]);
    }
  }
  return pairs;
};

export function spatialHash(cellSize = 128, smallScene = 100): CollisionDetector {
  const cells = new Map<number, number[]>();
  const used: number[][] = [];
  const usedX: number[] = [];
  const usedY: number[] = [];
  const free: number[][] = [];
  const found: number[] = [];
  let minX = new Int32Array(256);
  let minY = new Int32Array(256);

  return (entities) => {
    const list = collidable(entities);
    const n = list.length;
    if (n < smallScene) return bruteForce(list);
    if (minX.length < n) {
      minX = new Int32Array(n * 2);
      minY = new Int32Array(n * 2);
    }
    for (const bucket of used) {
      bucket.length = 0;
      free.push(bucket);
    }
    used.length = 0;
    usedX.length = 0;
    usedY.length = 0;
    cells.clear();
    found.length = 0;

    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (!e) continue;
      const x0 = Math.floor((e.pos.x - e.radius) / cellSize);
      const x1 = Math.floor((e.pos.x + e.radius) / cellSize);
      const y0 = Math.floor((e.pos.y - e.radius) / cellSize);
      const y1 = Math.floor((e.pos.y + e.radius) / cellSize);
      minX[i] = x0;
      minY[i] = y0;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const key = (cx + 512) * 4096 + (cy + 512);
          let bucket = cells.get(key);
          if (!bucket) {
            bucket = free.pop() ?? [];
            used.push(bucket);
            usedX.push(cx);
            usedY.push(cy);
            cells.set(key, bucket);
          }
          bucket.push(i);
        }
      }
    }

    for (let c = 0; c < used.length; c++) {
      const bucket = used[c];
      if (!bucket) continue;
      const cx = usedX[c];
      const cy = usedY[c];
      for (let p = 0; p < bucket.length; p++) {
        const i = bucket[p] ?? 0;
        for (let q = p + 1; q < bucket.length; q++) {
          const j = bucket[q] ?? 0;
          if (
            Math.max(minX[i] ?? 0, minX[j] ?? 0) !== cx ||
            Math.max(minY[i] ?? 0, minY[j] ?? 0) !== cy
          )
            continue;
          const a = list[i];
          const b = list[j];
          if (a && b && overlaps(a, b)) found.push(i < j ? i * n + j : j * n + i);
        }
      }
    }

    found.sort((a, b) => a - b);
    const pairs: Pair[] = [];
    for (const key of found) {
      const a = list[Math.floor(key / n)];
      const b = list[key % n];
      if (a && b) pairs.push([a, b]);
    }
    return pairs;
  };
}

export const findCollisions: CollisionDetector = spatialHash();
