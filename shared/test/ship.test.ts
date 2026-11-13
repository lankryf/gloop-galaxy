import { describe, expect, test } from "vitest";
import { seq } from "../ids.ts";
import { ARENA } from "../sim/arena.ts";
import { IDLE, integrate, quantizeAngle, SHIP, Ship } from "../sim/ship.ts";
import { Vector2 } from "../sim/vector.ts";
import { World } from "../sim/world.ts";

const at = (x: number, y: number, vx = 0, vy = 0, angle = 0) => ({ x, y, vx, vy, angle });
const dt = 1 / 30;

describe("integrate", () => {
  test("idle ship at rest stays where it is", () => {
    expect(integrate(at(100, 100), IDLE, dt)).toEqual({ ...at(100, 100), thrust: false });
  });

  test("thrust along angle 0 speeds up along x only", () => {
    const next = integrate(at(100, 100), { ...IDLE, thrust: true }, dt);
    expect(next.vx).toBeCloseTo(SHIP.thrust * dt * (1 - SHIP.drag * dt), 9);
    expect(next.vy).toBeCloseTo(0, 12);
    expect(next.thrust).toBe(true);
  });

  test("left and right turn by turnSpeed * dt and cancel each other", () => {
    expect(integrate(at(0, 0), { ...IDLE, left: true }, dt).angle).toBeCloseTo(
      -SHIP.turnSpeed * dt,
      12,
    );
    expect(integrate(at(0, 0), { ...IDLE, right: true }, dt).angle).toBeCloseTo(
      SHIP.turnSpeed * dt,
      12,
    );
    expect(integrate(at(0, 0), { ...IDLE, left: true, right: true }, dt).angle).toBe(0);
  });

  test("with a mouse aim the ship turns toward it at aimTurnSpeed and stops there", () => {
    const first = integrate(at(0, 0), { ...IDLE, aim: 1 }, dt);
    expect(first.angle).toBeCloseTo(SHIP.aimTurnSpeed * dt, 12);
    let state = { ...at(0, 0), angle: 0 };
    for (let i = 0; i < 30; i++) state = { ...integrate(state, { ...IDLE, aim: 1 }, dt) };
    expect(state.angle).toBeCloseTo(1, 12);
    const back = integrate(at(0, 0, 0, 0, 3), { ...IDLE, aim: -3 }, dt);
    expect(back.angle).toBeGreaterThan(3);
  });

  test("keys win over the mouse aim", () => {
    expect(integrate(at(0, 0), { ...IDLE, aim: 1, left: true }, dt).angle).toBeCloseTo(
      -SHIP.turnSpeed * dt,
      12,
    );
  });

  test("drag slows a coasting ship", () => {
    const next = integrate(at(100, 100, 200, 0), IDLE, dt);
    expect(next.vx).toBeCloseTo(200 * (1 - SHIP.drag * dt), 9);
  });

  test("speed is capped at maxSpeed", () => {
    let s = integrate(at(100, 100), { ...IDLE, thrust: true }, dt);
    for (let i = 0; i < 600; i++) s = integrate(s, { ...IDLE, thrust: true }, dt);
    expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(SHIP.maxSpeed + 1e-9);
  });

  test("hitting the wall stops at the edge and bounces back at half speed", () => {
    const next = integrate(at(ARENA.width - 25, 900, 300, 0), IDLE, dt);
    expect(next.x).toBe(ARENA.width - SHIP.radius);
    expect(next.vx).toBeCloseTo(-300 * (1 - SHIP.drag * dt) * SHIP.wallBounce, 9);
  });

  test("quantizeAngle keeps angles in (-PI, PI] with 1e-4 steps", () => {
    expect(quantizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 4);
    expect(quantizeAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 4);
    expect(quantizeAngle(0.123456)).toBe(0.1235);
  });
});

describe("Ship", () => {
  test("damage kills at zero hp and starts the respawn timer", () => {
    const world = new World();
    const ship = world.spawn(new Ship({ pos: new Vector2(100, 100) }));
    expect(ship.damage(60)).toBe(false);
    expect(ship.hp).toBe(40);
    expect(ship.damage(60)).toBe(true);
    expect(ship.dead).toBe(true);
    expect(ship.collidable).toBe(false);
    expect(ship.respawnIn).toBe(SHIP.respawnDelay);
  });

  test("shield blocks damage", () => {
    const ship = new Ship({ pos: new Vector2() });
    ship.applyPickup("shield");
    expect(ship.damage(500)).toBe(false);
    expect(ship.hp).toBe(SHIP.maxHp);
  });

  test("a dead ship respawns after respawnDelay with full hp", () => {
    const world = new World();
    const ship = world.spawn(new Ship({ pos: new Vector2(100, 100), inputDriven: true }));
    ship.kill();
    for (let t = 0; t < SHIP.respawnDelay + 0.1; t += dt) world.step(dt);
    expect(ship.dead).toBe(false);
    expect(ship.hp).toBe(SHIP.maxHp);
  });

  test("fire respects the cooldown: 0.18 s is one shot every 6 ticks", () => {
    const world = new World();
    const ship = world.spawn(new Ship({ pos: new Vector2(800, 1500), inputDriven: true }));
    const fire = { ...IDLE, fire: true };
    for (let i = 1; i <= 30; i++) {
      ship.steer(fire, dt, world, seq(i));
      world.step(dt);
    }
    const shots = [...world.ofKind("bullet")].length;
    expect(shots).toBe(5);
  });

  test("effects run out", () => {
    const world = new World();
    const ship = world.spawn(new Ship({ pos: new Vector2(100, 100), inputDriven: true }));
    ship.applyPickup("rapid");
    for (let t = 0; t < 8.1; t += dt) world.step(dt);
    expect(ship.effects.has("rapid")).toBe(false);
  });
});
