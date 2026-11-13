import { describe, expect, test } from "vitest";
import { Asteroid } from "../sim/asteroid.ts";
import { MISSILE } from "../sim/missile.ts";
import { Pickup } from "../sim/pickup.ts";
import { createRng } from "../sim/random.ts";
import { IDLE, Ship, WARP_DISTANCE } from "../sim/ship.ts";
import { Vector2 } from "../sim/vector.ts";
import { World } from "../sim/world.ts";

const dt = 1 / 30;

function setup(x = 800, y = 900) {
  const world = new World();
  const ship = world.spawn(new Ship({ pos: new Vector2(x, y), angle: 0 }));
  return { world, ship };
}

function press(world: World, ship: Ship) {
  ship.controls = { ...IDLE, use: true };
  world.step(dt);
  ship.controls = IDLE;
}

describe("abilities", () => {
  test("ability pickup goes into the slot, effect pickup does not", () => {
    const { ship } = setup();
    ship.applyPickup("nuke");
    ship.applyPickup("shield");
    expect(ship.ability).toBe("nuke");
    expect(ship.effects.has("shield")).toBe(true);
  });

  test("ability is used once on key press", () => {
    const { world, ship } = setup();
    const used: string[] = [];
    world.events.on("ability", (e) => used.push(e.ability));
    ship.applyPickup("missile");
    ship.controls = { ...IDLE, use: true };
    world.step(dt);
    world.step(dt);
    expect(used).toEqual(["missile"]);
    expect(ship.ability).toBeNull();
    expect([...world.ofKind("missile")].length).toBe(1);
  });

  test("warp moves the ship forward but keeps it inside the arena", () => {
    const { world, ship } = setup(800, 900);
    ship.applyPickup("warp");
    press(world, ship);
    expect(ship.pos.x).toBeGreaterThan(800 + WARP_DISTANCE * 0.9);

    const edge = setup(3100, 900);
    edge.ship.applyPickup("warp");
    press(edge.world, edge.ship);
    expect(edge.ship.pos.x).toBeLessThan(3200);
  });

  test("gravity beam drags what is ahead and leaves the rest", () => {
    const { world, ship } = setup();
    const ahead = world.spawn(new Pickup({ pos: new Vector2(1300, 920), type: "rapid" }));
    const behind = world.spawn(new Pickup({ pos: new Vector2(500, 900), type: "shield" }));
    const aside = world.spawn(new Pickup({ pos: new Vector2(800, 1200), type: "homing" }));
    ship.applyPickup("gravity");
    press(world, ship);
    expect(ship.effects.has("pull")).toBe(true);
    for (let i = 0; i < 15; i++) world.step(dt);
    expect(ahead.pos.x).toBeLessThan(1250);
    expect(behind.pos.x).toBeCloseTo(500, 0);
    expect(aside.pos.y).toBeCloseTo(1200, 0);
  });

  test("nuke blows up asteroids around but spares its owner", () => {
    const { world, ship } = setup();
    const rock = world.spawn(
      new Asteroid({
        pos: new Vector2(1300, 900),
        vel: new Vector2(),
        radius: 20,
        rng: createRng(1),
      }),
    );
    ship.applyPickup("nuke");
    press(world, ship);
    for (let t = 0; t < MISSILE.nuke.ttl + 0.2; t += dt) world.step(dt);
    expect(rock.alive).toBe(false);
    expect(ship.dead).toBe(false);
    expect([...world.ofKind("missile")].length).toBe(0);
  });

  test("homing missile turns toward an enemy ship", () => {
    const { world, ship } = setup(800, 900);
    const enemy = world.spawn(new Ship({ pos: new Vector2(800, 1300), name: "enemy" }));
    ship.applyPickup("missile");
    press(world, ship);
    const [missile] = world.ofKind("missile");
    if (!missile) throw new Error("no missile");
    for (let i = 0; i < 6; i++) world.step(dt);
    expect(missile.vel.y).toBeGreaterThan(0);
    expect(enemy.alive).toBe(true);
  });
});
