import { seq } from "../ids.ts";
import { ARENA } from "./arena.ts";
import { Asteroid } from "./asteroid.ts";
import type { Controls } from "./ship.ts";
import { Ship } from "./ship.ts";
import { Vector2 } from "./vector.ts";
import { GravityWell } from "./well.ts";
import { World } from "./world.ts";

export function scriptedInput(step: number, lane: number): Controls {
  const phase = (step + lane * 37) % 180;
  return {
    thrust: phase < 120,
    left: phase > 40 && phase < 70,
    right: phase > 130 && phase < 150,
    fire: phase % 20 < 3,
  };
}

export function runScenario({
  steps = 1000,
  dt = 1 / 30,
  seed = 7,
}: {
  steps?: number;
  dt?: number;
  seed?: number;
} = {}): World {
  const world = new World({ seed });
  world.spawn(
    new GravityWell({
      type: "blackhole",
      pos: new Vector2(ARENA.width * 0.66, ARENA.height * 0.62),
      vel: new Vector2(-14, 9),
    }),
  );
  world.spawn(GravityWell.planet({ x: 0.3, y: 0.38 }));
  for (let i = 0; i < 8; i++) world.spawn(Asteroid.incoming(world.rng, ARENA, i * 60));
  const ships = [0, 1, 2].map(() => {
    const spot = world.findSafeSpot(40, ARENA);
    return world.spawn(new Ship({ pos: new Vector2(spot.x, spot.y), inputDriven: true }));
  });
  for (let step = 0; step < steps; step++) {
    ships.forEach((ship, lane) => {
      ship.steer(scriptedInput(step, lane), dt, world, seq(step + 1));
    });
    world.step(dt);
  }
  return world;
}
