import { ARENA } from "./arena.js";
import { Asteroid } from "./asteroid.js";
import { Ship } from "./ship.js";
import { Vector2 } from "./vector.js";
import { GravityWell } from "./well.js";
import { World } from "./world.js";

export function scriptedInput(step, lane) {
  const phase = (step + lane * 37) % 180;
  return {
    thrust: phase < 120,
    left: phase > 40 && phase < 70,
    right: phase > 130 && phase < 150,
    fire: phase % 20 < 3,
  };
}

export function runScenario({ steps = 1000, dt = 1 / 30, seed = 7 } = {}) {
  const world = new World({ seed });
  world.spawn(GravityWell.fromConfig({ type: "blackhole", x: 0.66, y: 0.62, drift: [-14, 9] }));
  world.spawn(GravityWell.fromConfig({ type: "planet", x: 0.3, y: 0.38 }));
  for (let i = 0; i < 8; i++) world.spawn(Asteroid.random(world.rng, ARENA, world));
  const ships = [0, 1, 2].map(() => {
    const spot = world.findSafeSpot(40, ARENA);
    return world.spawn(new Ship({ pos: new Vector2(spot.x, spot.y), inputDriven: true }));
  });
  for (let step = 0; step < steps; step++) {
    ships.forEach((ship, lane) => {
      ship.steer(scriptedInput(step, lane), dt, world, step + 1);
    });
    world.step(dt);
  }
  return world;
}
