export const ARENA = { width: 1600, height: 900 };

export function wrap(value, size) {
  if (value < 0) return value + size;
  if (value >= size) return value - size;
  return value;
}
