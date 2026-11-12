export const ARENAS = {
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
