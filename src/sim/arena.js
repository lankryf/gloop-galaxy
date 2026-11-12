export const ARENA = { width: 1600, height: 900 };

export function wrap(value, size) {
  if (value < 0) return value + size;
  if (value >= size) return value - size;
  return value;
}

export function wrapPosition(ship, arena = ARENA) {
  return { ...ship, x: wrap(ship.x, arena.width), y: wrap(ship.y, arena.height) };
}
