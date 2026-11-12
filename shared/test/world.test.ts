import { describe, expect, test, vi } from "vitest";
import { hashWorld } from "../sim/hash.ts";
import { Pickup } from "../sim/pickup.ts";
import { runScenario } from "../sim/scenario.ts";
import { Ship } from "../sim/ship.ts";
import { Vector2 } from "../sim/vector.ts";
import { World } from "../sim/world.ts";

describe("World", () => {
  test("two worlds with the same seed stay identical step by step", () => {
    for (const steps of [1, 10, 100, 300]) {
      expect(hashWorld(runScenario({ steps }))).toBe(hashWorld(runScenario({ steps })));
    }
  });

  test("different seeds diverge", () => {
    expect(hashWorld(runScenario({ steps: 50, seed: 1 }))).not.toBe(
      hashWorld(runScenario({ steps: 50, seed: 2 })),
    );
  });

  test("spawn assigns increasing ids", () => {
    const world = new World();
    const a = world.spawn(new Pickup({ pos: new Vector2(), type: "shield" }));
    const b = world.spawn(new Pickup({ pos: new Vector2(), type: "rapid" }));
    expect(b.id).toBe(a.id + 1);
    expect(world.get(a.id)).toBe(a);
  });

  test("entities spawned during a step appear after it", () => {
    const world = new World();
    const spawned = new Pickup({ pos: new Vector2(), type: "shield" });
    world.later(0, (w) => w.spawn(spawned));
    world.step(1 / 30);
    expect([...world]).toContain(spawned);
  });

  test("despawned entities are removed on the next step", () => {
    const world = new World();
    const p = world.spawn(new Pickup({ pos: new Vector2(), type: "shield" }));
    world.despawn(p.id);
    world.step(1 / 30);
    expect(world.get(p.id)).toBeUndefined();
  });

  test("timers fire once at their time", () => {
    const world = new World();
    const action = vi.fn();
    world.later(0.1, action);
    for (let i = 0; i < 10; i++) world.step(1 / 30);
    expect(action).toHaveBeenCalledTimes(1);
  });

  test("ofKind only yields living entities of that kind", () => {
    const world = new World();
    world.spawn(new Ship({ pos: new Vector2(10, 10) }));
    const dead = world.spawn(new Ship({ pos: new Vector2(500, 500) }));
    dead.alive = false;
    world.spawn(new Pickup({ pos: new Vector2(), type: "homing" }));
    expect([...world.ofKind("ship")]).toHaveLength(1);
    expect([...world.ofKind("pickup")]).toHaveLength(1);
  });

  test("findSafeSpot avoids a big asteroid in the middle", () => {
    const world = new World();
    world.spawn(new Pickup({ pos: new Vector2(800, 450), type: "shield" }));
    const spot = world.findSafeSpot(40, { width: 1600, height: 900 });
    expect(Math.hypot(spot.x - 800, spot.y - 450)).toBeGreaterThan(40);
  });
});
