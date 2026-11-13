import { describe, expect, test } from "vitest";
import { entityId } from "../ids.ts";
import { Asteroid } from "../sim/asteroid.ts";
import { Bullet } from "../sim/bullet.ts";
import { DUST, Dust } from "../sim/dust.ts";
import { MISSILE, Missile } from "../sim/missile.ts";
import { createRng } from "../sim/random.ts";
import { ROCKS } from "../sim/rules.ts";
import { HEAT, IDLE, RADIATOR, SHIP, Ship } from "../sim/ship.ts";
import { Vector2 } from "../sim/vector.ts";
import { GravityWell } from "../sim/well.ts";
import { World } from "../sim/world.ts";

const dt = 1 / 30;
const rock = (world: World, x: number, y: number, radius: number, vx = 0, vy = 0) =>
  world.spawn(
    new Asteroid({
      pos: new Vector2(x, y),
      vel: new Vector2(vx, vy),
      radius,
      rng: createRng(Math.round(x + y)),
    }),
  );
const count = (world: World, kind: "asteroid" | "dust" | "well") => [...world.ofKind(kind)].length;

describe("iron dust", () => {
  test("breaking an asteroid gives no points but drops dust", () => {
    const world = new World({ seed: 1 });
    const ship = world.spawn(new Ship({ pos: new Vector2(200, 200) }));
    const a = rock(world, 1500, 1200, 20);
    world.spawn(new Bullet({ pos: new Vector2(1500, 1200), vel: new Vector2(), ownerId: ship.id }));
    world.step(dt);
    expect(a.alive).toBe(false);
    expect(ship.score).toBe(0);
    expect(count(world, "dust")).toBeGreaterThanOrEqual(2);
  });

  test("dust is pulled to a ship nearby, gives points and heals", () => {
    const world = new World({ seed: 1 });
    const ship = world.spawn(new Ship({ pos: new Vector2(1000, 1000) }));
    ship.damage(30);
    world.spawn(new Dust({ pos: new Vector2(1000 + DUST.magnet - 20, 1000), vel: new Vector2() }));
    const far = world.spawn(new Dust({ pos: new Vector2(2000, 2000), vel: new Vector2() }));
    for (let i = 0; i < 60; i++) world.step(dt);
    expect(ship.score).toBe(DUST.points);
    expect(ship.hp).toBeCloseTo(70 + DUST.heal, 5);
    expect(far.alive).toBe(true);
  });

  test("healing can go 50% over max and the extra drains 3 hp per second", () => {
    const ship = new Ship({ pos: new Vector2() });
    ship.heal(500);
    expect(ship.hp).toBe(SHIP.maxHp * SHIP.overheal);
    const world = new World();
    world.spawn(ship);
    for (let i = 0; i < 30; i++) world.step(dt);
    expect(ship.hp).toBeCloseTo(SHIP.maxHp * SHIP.overheal - SHIP.overhealDecay, 3);
    for (let i = 0; i < 30 * 30; i++) world.step(dt);
    expect(ship.hp).toBe(SHIP.maxHp);
  });
});

describe("score", () => {
  test("is lost when the ship dies", () => {
    const ship = new Ship({ pos: new Vector2() });
    ship.score = 340;
    ship.kill();
    expect(ship.score).toBe(0);
  });
});

describe("heat", () => {
  test("long fire overheats the gun, then it cools down", () => {
    const world = new World();
    const ship = world.spawn(new Ship({ pos: new Vector2(1000, 1000) }));
    ship.controls = { ...IDLE, fire: true };
    let steps = 0;
    while (!ship.overheated && steps < 30 * 20) {
      world.step(dt);
      steps++;
    }
    expect(ship.overheated).toBe(true);
    const bullets = count(world, "dust") + [...world.ofKind("bullet")].length;
    world.step(dt);
    world.step(dt);
    expect([...world.ofKind("bullet")].length).toBeLessThanOrEqual(bullets);
    ship.controls = IDLE;
    for (let i = 0; i < 30 * 4; i++) world.step(dt);
    expect(ship.overheated).toBe(false);
    expect(ship.heat).toBeLessThan(HEAT.resumeAt);
  });

  test("radiator dumps the heat and keeps the gun cold for a while", () => {
    const world = new World();
    const ship = world.spawn(new Ship({ pos: new Vector2(1000, 1000) }));
    ship.heat = HEAT.max;
    ship.overheated = true;
    ship.applyPickup("radiator");
    ship.controls = { ...IDLE, use: true };
    world.step(dt);
    expect(ship.heat).toBe(0);
    expect(ship.overheated).toBe(false);
    ship.controls = { ...IDLE, fire: true };
    for (let t = 0; t < RADIATOR - 0.5; t += dt) world.step(dt);
    expect(ship.heat).toBe(0);
  });
});

describe("asteroids and planets", () => {
  test("small asteroids burn up on a planet", () => {
    const world = new World({ seed: 1 });
    world.spawn(new GravityWell({ type: "planet", pos: new Vector2(2000, 1300) }));
    const a = rock(world, 2000 - 170 - 5, 1300, ROCKS.splitMin - 4, 100);
    world.step(dt);
    expect(a.alive).toBe(false);
    expect(count(world, "asteroid")).toBe(0);
  });

  test("big asteroids either bounce or split in two or three", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const world = new World({ seed });
      world.spawn(new GravityWell({ type: "planet", pos: new Vector2(2000, 1300) }));
      const a = rock(world, 2000 - 170 - 40, 1300, 45, 100);
      world.step(dt);
      const n = count(world, "asteroid");
      if (a.alive) outcomes.add("bounce");
      else {
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(3);
        for (const piece of world.ofKind("asteroid")) expect(piece.fragment).toBe(true);
        outcomes.add("split");
      }
    }
    expect(outcomes).toEqual(new Set(["bounce", "split"]));
  });

  test("a nuke cracks a planet into asteroids, and the planet comes back later", () => {
    const world = new World({ seed: 1 });
    const planet = world.spawn(GravityWell.planet({ x: 0.5, y: 0.5 }));
    const m = world.spawn(
      new Missile({
        pos: planet.pos.add(new Vector2(-planet.radius - 40, 0)),
        vel: new Vector2(),
        type: "nuke",
        ownerId: entityId(999),
      }),
    );
    for (let t = 0; t < MISSILE.nuke.ttl + 0.1; t += dt) world.step(dt);
    expect(m.alive).toBe(false);
    expect(planet.alive).toBe(false);
    expect(count(world, "asteroid")).toBeGreaterThanOrEqual(4);
    for (let t = 0; t < ROCKS.planetBack + 1; t += dt) world.step(dt);
    expect([...world.ofKind("well")].some((w) => w.type === "planet")).toBe(true);
  });

  test("slow asteroids stick together, and a big enough lump becomes a planet", () => {
    const world = new World({ seed: 1 });
    const a = rock(world, 2000, 1300, 40, 20);
    const b = rock(world, 2075, 1300, 40, -20);
    world.step(dt);
    expect(a.alive || b.alive).toBe(false);
    const [merged] = world.ofKind("asteroid");
    expect(merged?.radius).toBeCloseTo(Math.cbrt(2 * 40 ** 3), 5);

    const lump = new World({ seed: 2 });
    rock(lump, 2000, 1300, 75, 10);
    rock(lump, 2000 + 75 + 60, 1300, 70, -10);
    lump.step(dt);
    const planets = [...lump.ofKind("well")];
    expect(planets).toHaveLength(1);
    expect(planets[0]?.radius).toBeGreaterThanOrEqual(ROCKS.planetFrom);
    expect(count(lump, "asteroid")).toBe(0);
  });

  test("fast asteroids bounce instead of merging", () => {
    const world = new World({ seed: 1 });
    rock(world, 2000, 1300, 40, 200);
    rock(world, 2075, 1300, 40, -200);
    world.step(dt);
    expect(count(world, "asteroid")).toBe(2);
  });
});
