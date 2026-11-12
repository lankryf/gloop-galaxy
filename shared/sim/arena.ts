export interface ArenaSize {
  readonly width: number;
  readonly height: number;
}

export const ARENA: ArenaSize = { width: 1600, height: 900 };

export function wrap(value: number, size: number): number {
  if (value < 0) return value + size;
  if (value >= size) return value - size;
  return value;
}
