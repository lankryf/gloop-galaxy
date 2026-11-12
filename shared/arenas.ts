import type { WellPlacement } from "./sim/well.ts";

export interface ArenaRules {
  readonly asteroids: number;
  readonly pickups: number;
  readonly seed: number;
  readonly wells: readonly WellPlacement[];
}

export const ARENA_NAMES: readonly ["nebula", "junkyard"] = ["nebula", "junkyard"];
export type ArenaName = (typeof ARENA_NAMES)[number];

export const ARENAS: Readonly<Record<ArenaName, ArenaRules>> = {
  nebula: {
    asteroids: 6,
    pickups: 2,
    seed: 42,
    wells: [{ type: "blackhole", x: 0.66, y: 0.62, drift: [-14, 9] }],
  },
  junkyard: {
    asteroids: 11,
    pickups: 3,
    seed: 1337,
    wells: [
      { type: "planet", x: 0.3, y: 0.38 },
      { type: "blackhole", x: 0.78, y: 0.7, drift: [-10, -12] },
    ],
  },
};

export function isArenaName(name: string): name is ArenaName {
  return name === "nebula" || name === "junkyard";
}
