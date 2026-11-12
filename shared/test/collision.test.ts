import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { entityId } from "../ids.ts";
import { Asteroid } from "../sim/asteroid.ts";
import { BULLET, Bullet } from "../sim/bullet.ts";
import { bruteForce, findCollisions, spatialHash } from "../sim/collision.ts";
import { createRng } from "../sim/random.ts";
import { Vector2 } from "../sim/vector.ts";
import { World } from "../sim/world.ts";

const rock = (x: number, y: number, radius: number) =>
  new Asteroid({ pos: new Vector2(x, y), vel: new Vector2(), radius, rng: createRng(1) });

describe("findCollisions", () => {
  test("overlapping circles collide", () => {
    expect(findCollisions([rock(0, 0, 20), rock(30, 0, 20)])).toHaveLength(1);
  });

  test("exactly touching circles do not", () => {
    expect(findCollisions([rock(0, 0, 20), rock(40, 0, 20)])).toHaveLength(0);
  });

  test("far apart circles do not", () => {
    expect(findCollisions([rock(0, 0, 20), rock(300, 300, 20)])).toHaveLength(0);
  });

  test("dead and non-collidable entities are skipped", () => {
    const a = rock(0, 0, 20);
    const b = rock(10, 0, 20);
    b.alive = false;
    expect(findCollisions([a, b])).toHaveLength(0);
    b.alive = true;
    b.collidable = false;
    expect(findCollisions([a, b])).toHaveLength(0);
  });

  test("three overlapping circles give three pairs", () => {
    expect(findCollisions([rock(0, 0, 20), rock(10, 0, 20), rock(20, 0, 20)])).toHaveLength(3);
  });

  test("a full-speed bullet cannot tunnel through the smallest asteroid", () => {
    const dt = 1 / 30;
    expect(BULLET.speed * dt).toBeLessThan(2 * (20 + BULLET.radius));
    const world = new World({ systems: [] });
    world.spawn(rock(400, 300, 20));
    world.spawn(
      new Bullet({
        pos: new Vector2(250, 300),
        vel: new Vector2(BULLET.speed, 0),
        ownerId: entityId(999),
      }),
    );
    let hits = 0;
    world.events.on("hit", () => hits++);
    for (let i = 0; i < 15; i++) world.step(dt);
    expect(hits).toBe(1);
  });
});

describe("spatial hash", () => {
  const circle = fc.record({
    x: fc.double({ min: -50, max: 1650, noNaN: true }),
    y: fc.double({ min: -50, max: 950, noNaN: true }),
    r: fc.integer({ min: 2, max: 140 }),
  });

  test("finds exactly the same pairs in the same order as brute force", () => {
    fc.assert(
      fc.property(
        fc.array(circle, { maxLength: 120 }),
        fc.constantFrom(16, 64, 200),
        (circles, cell) => {
          const rocks = circles.map((c) => rock(c.x, c.y, c.r));
          const index = new Map<unknown, number>(rocks.map((r, i) => [r, i]));
          const ids = (pairs: readonly (readonly [unknown, unknown])[]) =>
            pairs.map(([a, b]) => [index.get(a), index.get(b)]);
          expect(ids(spatialHash(cell, 0)(rocks))).toEqual(ids(bruteForce(rocks)));
        },
      ),
      { numRuns: 200 },
    );
  });
});
