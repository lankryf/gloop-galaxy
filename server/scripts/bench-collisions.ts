import { Asteroid } from "@gloop/shared/sim/asteroid.ts";
import type { CollisionDetector } from "@gloop/shared/sim/collision.ts";
import { bruteForce, spatialHash } from "@gloop/shared/sim/collision.ts";
import { createRng } from "@gloop/shared/sim/random.ts";
import { Vector2 } from "@gloop/shared/sim/vector.ts";

function scene(n: number): Asteroid[] {
  const rng = createRng(n);
  return Array.from(
    { length: n },
    () =>
      new Asteroid({
        pos: new Vector2(rng.range(0, 1600), rng.range(0, 900)),
        vel: new Vector2(),
        radius: rng.pick([6, 22, 30, 44] as const),
        rng,
      }),
  );
}

function bench(detect: CollisionDetector, entities: Asteroid[], rounds: number): number {
  for (let i = 0; i < 50; i++) detect(entities);
  const started = performance.now();
  for (let i = 0; i < rounds; i++) detect(entities);
  return ((performance.now() - started) / rounds) * 1000;
}

const grid = spatialHash();
const rows = [50, 150, 300, 600, 1200].map((n) => {
  const entities = scene(n);
  const rounds = Math.max(50, Math.round(200_000 / n));
  const brute = bench(bruteForce, entities, rounds);
  const hashed = bench(grid, entities, rounds);
  return {
    entities: n,
    bruteUs: Number(brute.toFixed(1)),
    gridUs: Number(hashed.toFixed(1)),
    speedup: Number((brute / hashed).toFixed(2)),
  };
});
console.table(rows);
