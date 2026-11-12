declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type EntityId = Brand<number, "EntityId">;
export type Tick = Brand<number, "Tick">;
export type Seq = Brand<number, "Seq">;

export const NO_ENTITY = 0;

export function isEntityId(n: number): n is EntityId {
  return Number.isInteger(n) && n > 0 && n <= 0xffff;
}

export function isTick(n: number): n is Tick {
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
}

export function isSeq(n: number): n is Seq {
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
}

export function entityId(n: number): EntityId {
  if (!isEntityId(n)) throw new RangeError(`Not an entity id: ${n}`);
  return n;
}

export function tick(n: number): Tick {
  if (!isTick(n)) throw new RangeError(`Not a tick: ${n}`);
  return n;
}

export function seq(n: number): Seq {
  if (!isSeq(n)) throw new RangeError(`Not a seq: ${n}`);
  return n;
}
