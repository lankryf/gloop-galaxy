export interface ArenaSize {
  readonly width: number;
  readonly height: number;
}

export const ARENA: ArenaSize = { width: 1600, height: 900 };

export function wrap(value: number, size: number): number {
  if (value >= 0 && value < size) return value;
  const r = value % size;
  const wrapped = r < 0 ? r + size : r;
  return wrapped < size ? wrapped : 0;
}
