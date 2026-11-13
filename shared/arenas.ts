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
    asteroids: 16,
    pickups: 6,
    seed: 42,
    wells: [
      { type: "blackhole", x: 0.68, y: 0.62, drift: [-14, 9] },
      { type: "blackhole", x: 0.22, y: 0.3, drift: [12, 10] },
      { type: "planet", x: 0.45, y: 0.82 },
    ],
  },
  junkyard: {
    asteroids: 26,
    pickups: 8,
    seed: 1337,
    wells: [
      { type: "planet", x: 0.25, y: 0.35 },
      { type: "planet", x: 0.75, y: 0.25 },
      { type: "blackhole", x: 0.78, y: 0.72, drift: [-10, -12] },
      { type: "blackhole", x: 0.3, y: 0.75, drift: [14, -8] },
    ],
  },
};

export function isArenaName(name: string): name is ArenaName {
  return name === "nebula" || name === "junkyard";
}
