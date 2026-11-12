import assert from "node:assert/strict";
import { test } from "vitest";
import { entityId } from "../ids.ts";
import { ARENA } from "../sim/arena.ts";
import { hashWorld } from "../sim/hash.ts";
import { Pickup } from "../sim/pickup.ts";
import { runScenario } from "../sim/scenario.ts";
import { quantizeShip, Ship, shipPhysics } from "../sim/ship.ts";
import { Vector2 } from "../sim/vector.ts";
import { GravityWell } from "../sim/well.ts";
import { World } from "../sim/world.ts";

test("sim modules load in Node without DOM", () => {
  assert.equal("document" in globalThis, false);
  assert.equal("window" in globalThis, false);
  assert.ok(new World());
});

test("same inputs give the same world", () => {
  const a = hashWorld(runScenario({ steps: 900 }));
  const b = hashWorld(runScenario({ steps: 900 }));
  assert.equal(a, b);
});

test("different seed gives a different world", () => {
  assert.notEqual(
    hashWorld(runScenario({ seed: 1, steps: 300 })),
    hashWorld(runScenario({ seed: 2, steps: 300 })),
  );
});

test("shipPhysics is what the server applies to an input-driven ship", () => {
  const world = new World({ seed: 3 });
  world.spawn(GravityWell.fromConfig({ type: "planet", x: 0.5, y: 0.5 }));
  const ship = world.spawn(new Ship({ pos: new Vector2(500, 300), inputDriven: true }));
  let predicted = quantizeShip(ship.state);
  const planet = world.get(entityId(1));
  assert.ok(planet?.kind === "well");
  const wells = [planet.field];
  for (let i = 0; i < 60; i++) {
    const input = { thrust: i < 40, left: i % 7 === 0, right: false, fire: false };
    predicted = shipPhysics(predicted, input, 1 / 30, wells);
    ship.steer(input, 1 / 30, world);
  }
  assert.deepEqual(
    { x: ship.pos.x, y: ship.pos.y, vx: ship.vel.x, vy: ship.vel.y, angle: ship.angle },
    { x: predicted.x, y: predicted.y, vx: predicted.vx, vy: predicted.vy, angle: predicted.angle },
  );
});

test("entity ids are small and unique per world", () => {
  const world = new World();
  const ids = new Set<number>();
  for (let i = 0; i < 500; i++)
    ids.add(world.spawn(new Pickup({ pos: new Vector2(), type: "rapid" })).id);
  assert.equal(ids.size, 500);
  assert.ok(Math.max(...ids) <= 0xffff);
});

test("a black hole swallows a ship that sits still next to it", () => {
  const world = new World({ seed: 2 });
  world.spawn(new GravityWell({ type: "blackhole", pos: new Vector2(800, 450) }));
  const ship = world.spawn(new Ship({ pos: new Vector2(700, 450) }));
  let swallowed = false;
  world.events.on("swallowed", () => {
    swallowed = true;
  });
  for (let i = 0; i < 120 && !swallowed; i++) world.step(1 / 30);
  assert.ok(swallowed);
  assert.ok(ship.dead || ship.deaths === 1);
});

test("ships wrap around the arena", () => {
  const world = new World();
  const ship = world.spawn(new Ship({ pos: new Vector2(ARENA.width - 1, 100), angle: 0 }));
  ship.vel = new Vector2(400, 0);
  ship.controls = { ...ship.controls, thrust: true };
  world.step(1 / 30);
  assert.ok(ship.pos.x < 50);
});

test("scenario hash matches the value computed in Chrome", () => {
  assert.equal(hashWorld(runScenario({ steps: 1000 })), "192f27b8");
});
