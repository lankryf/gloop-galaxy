import type { Asteroid } from "./asteroid.ts";
import type { Bullet } from "./bullet.ts";
import type { Dust } from "./dust.ts";
import type { Explosion } from "./explosion.ts";
import type { Missile } from "./missile.ts";
import type { Pickup } from "./pickup.ts";
import type { Ship } from "./ship.ts";
import type { GravityWell } from "./well.ts";

export type AnyEntity =
  | Ship
  | Bullet
  | Asteroid
  | Pickup
  | Explosion
  | GravityWell
  | Missile
  | Dust;
export type EntityKind = AnyEntity["kind"];
export type OfKind<K extends EntityKind> = Extract<AnyEntity, { readonly kind: K }>;

export function isKind<K extends EntityKind>(entity: AnyEntity, kind: K): entity is OfKind<K> {
  return entity.kind === kind;
}
