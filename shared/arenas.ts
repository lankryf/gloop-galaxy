import type { ArenaSize } from "./sim/arena.ts";
import { ARENA } from "./sim/arena.ts";
import { Asteroid } from "./sim/asteroid.ts";
import { Pickup } from "./sim/pickup.ts";
import type { PlanetPlacement } from "./sim/well.ts";
import { GravityWell } from "./sim/well.ts";
import type { World } from "./sim/world.ts";

export interface ArenaRules {
  readonly asteroids: number;
  readonly pickups: number;
  readonly seed: number;
  readonly blackholes: number;
  readonly planets: readonly PlanetPlacement[];
}

export const ARENA_NAMES: readonly ["nebula", "junkyard"] = ["nebula", "junkyard"];
export type ArenaName = (typeof ARENA_NAMES)[number];

export const ARENAS: Readonly<Record<ArenaName, ArenaRules>> = {
  nebula: {
    asteroids: 36,
    pickups: 14,
    seed: 42,
    blackholes: 2,
    planets: [{ x: 0.32, y: 0.62 }],
  },
  junkyard: {
    asteroids: 55,
    pickups: 18,
    seed: 1337,
    blackholes: 3,
    planets: [
      { x: 0.22, y: 0.3 },
      { x: 0.74, y: 0.68 },
    ],
  },
};

export function isArenaName(name: string): name is ArenaName {
  return name === "nebula" || name === "junkyard";
}

export function populate(world: World, rules: ArenaRules, arena: ArenaSize = ARENA): void {
  for (const planet of rules.planets) world.spawn(GravityWell.planet(planet, arena));
  for (let i = 0; i < rules.blackholes; i++)
    world.spawn(GravityWell.incoming(world.rng, arena, world.rng.range(0, 900)));
  for (let i = 0; i < rules.asteroids; i++)
    world.spawn(Asteroid.incoming(world.rng, arena, world.rng.range(0, 600)));
  for (let i = 0; i < rules.pickups; i++) world.spawn(Pickup.random(world, arena));
}
