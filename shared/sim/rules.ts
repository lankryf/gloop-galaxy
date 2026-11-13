import type { EntityId } from "../ids.ts";
import { ARENA } from "./arena.ts";
import { Asteroid } from "./asteroid.ts";
import type { Bullet } from "./bullet.ts";
import type { Pair } from "./collision.ts";
import { Explosion } from "./explosion.ts";
import type { AnyEntity, EntityKind, OfKind } from "./kinds.ts";
import { isKind } from "./kinds.ts";
import type { Missile } from "./missile.ts";
import { MISSILE } from "./missile.ts";
import { Pickup } from "./pickup.ts";
import type { Ship } from "./ship.ts";
import type { Point } from "./vector.ts";
import { Vector2 } from "./vector.ts";
import { BLACK_HOLE, GravityWell } from "./well.ts";
import type { World } from "./world.ts";

const SCORE = { asteroid: 10, ship: 100 };

function credit(world: World, ownerId: EntityId, points: number, at: Point): void {
  const owner = world.get(ownerId);
  if (owner?.kind !== "ship") return;
  owner.score += points;
  world.emit("scored", { shipId: owner.id, points, x: at.x, y: at.y });
}

function explode(world: World, pos: Vector2, size: number, color?: string): void {
  world.spawn(new Explosion({ pos, rng: world.rng, size, ...(color ? { color } : {}) }));
  world.emit("exploded", { x: pos.x, y: pos.y, size });
}

function pushApart(a: AnyEntity, b: AnyEntity): { normal: Vector2; overlap: number } {
  const delta = b.pos.sub(a.pos);
  const dist = delta.length() || 1;
  const normal = delta.scale(1 / dist);
  const overlap = a.radius + b.radius - dist;
  return { normal, overlap };
}

function bounceOff(well: GravityWell, body: AnyEntity): void {
  const { normal, overlap } = pushApart(well, body);
  body.pos = body.pos.add(normal.scale(overlap + 1));
  const vn = body.vel.dot(normal);
  if (vn < 0) body.vel = body.vel.sub(normal.scale(vn * 1.8));
}

function asteroidBullet(world: World, asteroid: Asteroid, bullet: Bullet): void {
  bullet.alive = false;
  asteroid.hp -= 1;
  world.emit("hit", {
    x: bullet.pos.x,
    y: bullet.pos.y,
    target: "asteroid",
    ownerId: bullet.ownerId,
  });
  if (asteroid.hp > 0) return;
  shatter(world, asteroid, bullet.ownerId);
}

function bulletShip(world: World, bullet: Bullet, ship: Ship): void {
  if (bullet.ownerId === ship.id || ship.dead) return;
  bullet.alive = false;
  world.emit("hit", {
    x: bullet.pos.x,
    y: bullet.pos.y,
    target: "ship",
    shipId: ship.id,
    ownerId: bullet.ownerId,
  });
  if (ship.damage(bullet.damage)) {
    credit(world, bullet.ownerId, SCORE.ship, ship.pos);
    explode(world, ship.pos, 1.4);
  }
}

function asteroidShip(world: World, asteroid: Asteroid, ship: Ship): void {
  if (ship.dead) return;
  const { normal, overlap } = pushApart(asteroid, ship);
  ship.pos = ship.pos.add(normal.scale(overlap));
  ship.vel = normal.scale(Math.max(160, ship.vel.length() * 0.6));
  world.emit("hit", { x: ship.pos.x, y: ship.pos.y, target: "ship", shipId: ship.id });
  if (ship.damage(20)) explode(world, ship.pos, 1.4);
}

function pickupShip(world: World, pickup: Pickup, ship: Ship): void {
  if (ship.dead) return;
  pickup.alive = false;
  ship.applyPickup(pickup.type);
  world.emit("pickup", { shipId: ship.id, type: pickup.type, x: pickup.pos.x, y: pickup.pos.y });
  world.later(6, (w) => w.spawn(Pickup.random(w, ARENA)));
}

function asteroidAsteroid(a: Asteroid, b: Asteroid): void {
  const { normal, overlap } = pushApart(a, b);
  a.pos = a.pos.sub(normal.scale(overlap / 2));
  b.pos = b.pos.add(normal.scale(overlap / 2));
  const va = a.vel.dot(normal);
  const vb = b.vel.dot(normal);
  if (va - vb <= 0) return;
  a.vel = a.vel.add(normal.scale(vb - va));
  b.vel = b.vel.add(normal.scale(va - vb));
}

export const FEED = { bullet: 1, missile: 4, ship: 20, perAsteroidRadius: 0.4 };

function feed(world: World, well: GravityWell, amount: number): void {
  well.mass = Math.min(well.capacity, well.mass + amount);
  if (well.full) collapse(world, well);
}

export function collapse(world: World, well: GravityWell): void {
  if (!well.alive) return;
  well.alive = false;
  const at = well.pos;
  const reach = well.range;
  world.emit("collapsed", { x: at.x, y: at.y, range: reach });
  for (const ship of world.ofKind("ship")) {
    if (ship.dead) continue;
    const away = ship.pos.sub(at);
    const d = away.length();
    if (d > reach) continue;
    const k = 1 - d / reach;
    const dir = d > 0 ? away.scale(1 / d) : new Vector2(1, 0);
    ship.vel = ship.vel.add(dir.scale(900 * k));
    world.emit("hit", { x: ship.pos.x, y: ship.pos.y, target: "ship", shipId: ship.id });
    if (ship.damage(Math.round(40 + 140 * k))) explode(world, ship.pos, 1.4);
  }
  for (const body of world) {
    if (!body.alive || body.kind === "ship" || body.kind === "well" || body.kind === "explosion")
      continue;
    const away = body.pos.sub(at);
    const d = away.length();
    if (d > reach) continue;
    if (body.kind === "asteroid") {
      body.alive = false;
      explode(world, body.pos, body.radius / 35, "#b49ad1");
      world.later(world.rng.range(1, 3), (w) => w.spawn(Asteroid.incoming(w.rng, ARENA)));
      continue;
    }
    const dir = d > 0 ? away.scale(1 / d) : new Vector2(1, 0);
    body.vel = body.vel.add(dir.scale(700 * (1 - d / reach)));
  }
  world.later(BLACK_HOLE.respawn, (w) => w.spawn(GravityWell.incoming(w.rng, ARENA)));
}

function bulletWell(world: World, bullet: Bullet, well: GravityWell): void {
  bullet.alive = false;
  if (well.solid) return;
  world.emit("swallowed", { x: well.pos.x, y: well.pos.y, kind: "bullet" });
  feed(world, well, FEED.bullet);
}

function asteroidWell(world: World, asteroid: Asteroid, well: GravityWell): void {
  if (well.solid) {
    bounceOff(well, asteroid);
    return;
  }
  asteroid.alive = false;
  world.emit("swallowed", { x: well.pos.x, y: well.pos.y, kind: "asteroid" });
  world.later(2, (w) => w.spawn(Asteroid.incoming(w.rng, ARENA)));
  feed(world, well, asteroid.radius * FEED.perAsteroidRadius);
}

function shipWell(world: World, ship: Ship, well: GravityWell): void {
  if (ship.dead) return;
  if (well.solid) {
    bounceOff(well, ship);
    world.emit("hit", { x: ship.pos.x, y: ship.pos.y, target: "ship", shipId: ship.id });
    if (ship.damage(15)) explode(world, ship.pos, 1.4);
    return;
  }
  if (ship.effects.has("shield")) {
    const { normal } = pushApart(well, ship);
    ship.pos = well.pos.add(normal.scale(well.radius * 2.5));
    ship.vel = normal.scale(480);
    ship.effects.delete("shield");
    world.emit("hit", { x: ship.pos.x, y: ship.pos.y, target: "ship", shipId: ship.id });
    return;
  }
  ship.kill();
  world.emit("swallowed", { x: well.pos.x, y: well.pos.y, kind: "ship", shipId: ship.id });
  feed(world, well, FEED.ship);
}

function both<A extends EntityKind, B extends EntityKind>(
  [x, y]: Pair,
  a: A,
  b: B,
): readonly [OfKind<A>, OfKind<B>] | null {
  if (isKind(x, a) && isKind(y, b)) return [x, y];
  if (isKind(y, a) && isKind(x, b)) return [y, x];
  return null;
}

type Rule = (world: World, pair: Pair) => boolean;

function rule<A extends EntityKind, B extends EntityKind>(
  a: A,
  b: B,
  handle: (world: World, x: OfKind<A>, y: OfKind<B>) => void,
): Rule {
  return (world, pair) => {
    const matched = both(pair, a, b);
    if (!matched) return false;
    handle(world, matched[0], matched[1]);
    return true;
  };
}

export function detonate(world: World, missile: Missile): void {
  if (!missile.alive) return;
  missile.alive = false;
  const { blast, damage } = MISSILE[missile.type];
  const at = missile.pos;
  explode(
    world,
    at,
    missile.type === "nuke" ? 6 : 1.6,
    missile.type === "nuke" ? "#ffd23f" : "#ff7a3d",
  );
  for (const ship of world.ofKind("ship")) {
    if (ship.dead || (missile.type === "nuke" && ship.id === missile.ownerId)) continue;
    const away = ship.pos.sub(at);
    const d = away.length();
    if (d > blast) continue;
    const k = 1 - d / blast;
    const dir = d > 0 ? away.scale(1 / d) : new Vector2(1, 0);
    ship.vel = ship.vel.add(dir.scale(650 * k));
    world.emit("hit", {
      x: ship.pos.x,
      y: ship.pos.y,
      target: "ship",
      shipId: ship.id,
      ownerId: missile.ownerId,
    });
    if (ship.damage(Math.round(damage * Math.max(0.35, k)))) {
      credit(world, missile.ownerId, SCORE.ship, ship.pos);
      explode(world, ship.pos, 1.4);
    }
  }
  for (const asteroid of world.ofKind("asteroid")) {
    if (asteroid.pos.sub(at).length() > blast + asteroid.radius) continue;
    shatter(world, asteroid, missile.ownerId);
  }
}

function shatter(world: World, asteroid: Asteroid, ownerId: EntityId): void {
  asteroid.alive = false;
  credit(world, ownerId, SCORE.asteroid, asteroid.pos);
  explode(world, asteroid.pos, asteroid.radius / 35, "#b49ad1");
  world.later(world.rng.range(0.5, 2), (w) => w.spawn(Asteroid.incoming(w.rng, ARENA)));
}

function missileWell(world: World, missile: Missile, well: GravityWell): void {
  if (well.solid) {
    detonate(world, missile);
    return;
  }
  missile.alive = false;
  world.emit("swallowed", { x: well.pos.x, y: well.pos.y, kind: "bullet" });
  feed(world, well, FEED.missile);
}

const RULES: readonly Rule[] = [
  rule("asteroid", "bullet", asteroidBullet),
  rule("bullet", "ship", bulletShip),
  rule("asteroid", "ship", asteroidShip),
  rule("pickup", "ship", pickupShip),
  rule("asteroid", "asteroid", (_world, a, b) => asteroidAsteroid(a, b)),
  rule("bullet", "well", bulletWell),
  rule("asteroid", "well", asteroidWell),
  rule("ship", "well", shipWell),
  rule("missile", "ship", (world, m, ship) => {
    if (ship.id !== m.ownerId && !ship.dead) detonate(world, m);
  }),
  rule("asteroid", "missile", (world, _a, m) => detonate(world, m)),
  rule("missile", "well", missileWell),
];

export function resolveCollisions(world: World, pairs: readonly Pair[]): void {
  for (const pair of pairs) {
    if (!pair[0].alive || !pair[1].alive) continue;
    RULES.some((r) => r(world, pair));
  }
}
