export interface ArenaSize {
  readonly width: number;
  readonly height: number;
}

export const ARENA: ArenaSize = { width: 3200, height: 1800 };

export function outside(x: number, y: number, by: number, arena: ArenaSize = ARENA): boolean {
  return x < -by || y < -by || x > arena.width + by || y > arena.height + by;
}

export function inside(x: number, y: number, margin: number, arena: ArenaSize = ARENA): boolean {
  return x >= margin && y >= margin && x <= arena.width - margin && y <= arena.height - margin;
}

export function wrap(value: number, size: number): number {
  if (value >= 0 && value < size) return value;
  const r = value % size;
  const wrapped = r < 0 ? r + size : r;
  return wrapped < size ? wrapped : 0;
}
