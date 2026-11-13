import { describe, expect, test } from "vitest";
import { entityId } from "../ids.ts";
import { ARENA } from "../sim/arena.ts";
import { Asteroid } from "../sim/asteroid.ts";
import { MISSILE, Missile } from "../sim/missile.ts";
import { Pickup } from "../sim/pickup.ts";
import { createRng } from "../sim/random.ts";
import { BEAM_CHARGE, IDLE, SHIP, Ship, WARP_DELAY, WARP_DISTANCE } from "../sim/ship.ts";
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

  test("warp jumps forward after a 3 second charge and stays inside the arena", () => {
    const { world, ship } = setup(800, 900);
    const warps: boolean[] = [];
    world.events.on("warped", (e) => warps.push(e.arrive));
    ship.applyPickup("warp");
    press(world, ship);
    for (let t = dt; t < WARP_DELAY - 0.1; t += dt) world.step(dt);
    expect(ship.pos.x).toBeLessThan(900);
    expect(warps).toEqual([]);
    for (let i = 0; i < 6; i++) world.step(dt);
    expect(ship.pos.x).toBeGreaterThan(800 + WARP_DISTANCE * 0.9);
    expect(warps).toEqual([false, true]);

    const edge = setup(ARENA.width - 100, 900);
    edge.ship.applyPickup("warp");
    press(edge.world, edge.ship);
    for (let t = 0; t < WARP_DELAY + 0.2; t += dt) edge.world.step(dt);
    expect(edge.ship.pos.x).toBeLessThan(ARENA.width);
  });

  test("gravity beam works only while the key is held and runs out after 5 s", () => {
    const { world, ship } = setup();
    const ahead = world.spawn(new Pickup({ pos: new Vector2(1300, 920), type: "rapid" }));
    const behind = world.spawn(new Pickup({ pos: new Vector2(500, 900), type: "shield" }));
    const aside = world.spawn(new Pickup({ pos: new Vector2(800, 1200), type: "homing" }));
    ship.applyPickup("gravity");
    ship.controls = { ...IDLE, use: true };
    for (let i = 0; i < 15; i++) world.step(dt);
    expect(ship.beaming).toBe(true);
    expect(ahead.pos.x).toBeLessThan(1280);
    expect(behind.pos.x).toBeCloseTo(500, 0);
    expect(aside.pos.y).toBeCloseTo(1200, 0);

    ship.controls = IDLE;
    world.step(dt);
    expect(ship.beaming).toBe(false);
    expect(ship.ability).toBe("gravity");
    const left = ship.charge;
    for (let i = 0; i < 30; i++) world.step(dt);
    expect(ship.charge).toBe(left);

    ship.controls = { ...IDLE, use: true };
    for (let t = 0; t < BEAM_CHARGE; t += dt) world.step(dt);
    expect(ship.ability).toBeNull();
    world.step(dt);
    expect(ship.beaming).toBe(false);
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

  test("homing missile turns toward an enemy ship ahead", () => {
    const { world, ship } = setup(800, 900);
    world.spawn(new Ship({ pos: new Vector2(1600, 1250), name: "enemy" }));
    ship.applyPickup("missile");
    press(world, ship);
    const [missile] = world.ofKind("missile");
    if (!missile) throw new Error("no missile");
    for (let i = 0; i < 6; i++) world.step(dt);
    expect(missile.vel.y).toBeGreaterThan(0);
    expect(missile.lockedOn).not.toBeNull();
  });

  test("a ship can dodge the missile by flying sideways", () => {
    const world = new World();
    const enemy = world.spawn(
      new Ship({ pos: new Vector2(1700, 900), angle: Math.PI / 2, name: "enemy" }),
    );
    world.spawn(
      new Missile({
        pos: new Vector2(900, 900),
        vel: new Vector2(MISSILE.homing.speed, 0),
        type: "homing",
        ownerId: entityId(999),
      }),
    );
    enemy.controls = { ...IDLE, thrust: true };
    for (let i = 0; i < 30 * 6; i++) world.step(dt);
    expect(enemy.hp).toBe(100);
  });

  test("missile is slower than a ship at full speed", () => {
    expect(MISSILE.homing.speed).toBeLessThan(SHIP.maxSpeed);
  });
});
