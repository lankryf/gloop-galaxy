import { describe, expect, test } from "vitest";
import { ARENA, inside } from "../sim/arena.ts";
import { Asteroid } from "../sim/asteroid.ts";
import { Bullet } from "../sim/bullet.ts";
import { createRng } from "../sim/random.ts";
import { FEED } from "../sim/rules.ts";
import { Ship } from "../sim/ship.ts";
import { Vector2 } from "../sim/vector.ts";
import { GravityWell, WELLS } from "../sim/well.ts";
import { World } from "../sim/world.ts";

const dt = 1 / 30;

function hole(world: World, x = 2000, y = 1300) {
  return world.spawn(new GravityWell({ type: "blackhole", pos: new Vector2(x, y) }));
}

describe("black holes", () => {
  test("fly in from outside the arena", () => {
    const rng = createRng(5);
    for (let i = 0; i < 20; i++) {
      const w = GravityWell.incoming(rng, ARENA);
      expect(inside(w.pos.x, w.pos.y, 0, ARENA)).toBe(false);
      const ahead = w.pos.add(w.vel.scale(20));
      expect(inside(ahead.x, ahead.y, 0, ARENA)).toBe(true);
    }
  });

  test("do not vanish on a timer", () => {
    const world = new World({ seed: 1 });
    const w = world.spawn(
      new GravityWell({ type: "blackhole", pos: new Vector2(2400, 1350), vel: new Vector2() }),
    );
    for (let i = 0; i < 30 * 90; i++) world.step(dt);
    expect(w.alive).toBe(true);
  });

  test("leave through the edge and another one comes in", () => {
    const world = new World({ seed: 1 });
    const w = world.spawn(
      new GravityWell({
        type: "blackhole",
        pos: new Vector2(200, 1350),
        vel: new Vector2(-400, 0),
      }),
    );
    w.entered = true;
    for (let i = 0; i < 30 * 2; i++) world.step(dt);
    expect(w.alive).toBe(false);
    for (let i = 0; i < 30 * 9; i++) world.step(dt);
    expect([...world.ofKind("well")].length).toBe(1);
  });

  test("swallowed bodies fill it by their size", () => {
    const world = new World({ seed: 1 });
    const w = hole(world);
    world.spawn(new Bullet({ pos: new Vector2(2000, 1300), vel: new Vector2(), ownerId: w.id }));
    world.step(dt);
    expect(w.mass).toBeCloseTo(FEED.bullet, 5);
    world.spawn(
      new Asteroid({
        pos: new Vector2(2000, 1300),
        vel: new Vector2(),
        radius: 50,
        rng: createRng(1),
      }),
    );
    world.step(dt);
    expect(w.mass).toBeCloseTo(FEED.bullet + 50 * FEED.perAsteroidRadius, 5);
  });

  test("collapses when full and blasts everything within its gravity range", () => {
    const world = new World({ seed: 1 });
    const w = hole(world);
    const blasts: number[] = [];
    world.events.on("collapsed", (e) => blasts.push(e.range));
    const near = world.spawn(new Ship({ pos: new Vector2(2000 + 250, 1300), angle: 0 }));
    const far = world.spawn(
      new Ship({ pos: new Vector2(2000 + WELLS.blackhole.range + 300, 1300) }),
    );
    const rock = world.spawn(
      new Asteroid({
        pos: new Vector2(2000, 1300 - 400),
        vel: new Vector2(),
        radius: 20,
        rng: createRng(2),
      }),
    );
    w.mass = w.capacity - 0.5;
    world.spawn(new Bullet({ pos: new Vector2(2000, 1300), vel: new Vector2(), ownerId: near.id }));
    world.step(dt);
    expect(w.alive).toBe(false);
    expect(blasts).toEqual([WELLS.blackhole.range]);
    expect(near.hp).toBeLessThan(100);
    expect(near.vel.x).toBeGreaterThan(200);
    expect(far.hp).toBe(100);
    expect(rock.alive).toBe(false);
  });
});
