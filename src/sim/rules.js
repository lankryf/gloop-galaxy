import { ARENA } from "./arena.js";
import { Asteroid } from "./asteroid.js";
import { Explosion } from "./explosion.js";
import { Pickup } from "./pickup.js";

const SCORE = { asteroid: 10, ship: 100 };

function key(a, b) {
  return a.kind < b.kind ? [`${a.kind}|${b.kind}`, a, b] : [`${b.kind}|${a.kind}`, b, a];
}

function credit(world, ownerId, points, at) {
  const owner = world.get(ownerId);
  if (owner?.kind !== "ship") return;
  owner.score += points;
  world.emit("scored", { shipId: owner.id, points, x: at.x, y: at.y });
}

function explode(world, pos, size, color) {
  world.spawn(new Explosion({ pos, rng: world.rng, size, color }));
  world.emit("exploded", { x: pos.x, y: pos.y, size });
}

function pushApart(a, b) {
  const delta = b.pos.sub(a.pos);
  const dist = delta.length() || 1;
  const normal = delta.scale(1 / dist);
  const overlap = a.radius + b.radius - dist;
  return { normal, overlap };
}

const handlers = {
  "asteroid|bullet"(world, asteroid, bullet) {
    bullet.alive = false;
    asteroid.hp -= 1;
    world.emit("hit", {
      x: bullet.pos.x,
      y: bullet.pos.y,
      target: "asteroid",
      ownerId: bullet.ownerId,
    });
    if (asteroid.hp > 0) return;
    asteroid.alive = false;
    credit(world, bullet.ownerId, SCORE.asteroid, asteroid.pos);
    explode(world, asteroid.pos, asteroid.radius / 35, "#b49ad1");
    world.spawn(Asteroid.random(world.rng, ARENA));
  },

  "bullet|ship"(world, bullet, ship) {
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
  },

  "asteroid|ship"(world, asteroid, ship) {
    if (ship.dead) return;
    const { normal, overlap } = pushApart(asteroid, ship);
    ship.pos = ship.pos.add(normal.scale(overlap));
    ship.vel = normal.scale(Math.max(160, ship.vel.length() * 0.6));
    world.emit("hit", { x: ship.pos.x, y: ship.pos.y, target: "ship", shipId: ship.id });
    if (ship.damage(20)) explode(world, ship.pos, 1.4);
  },

  "pickup|ship"(world, pickup, ship) {
    if (ship.dead) return;
    pickup.alive = false;
    ship.applyPickup(pickup.type);
    world.emit("pickup", { shipId: ship.id, type: pickup.type, x: pickup.pos.x, y: pickup.pos.y });
    world.later(6, (w) => w.spawn(Pickup.random(w, ARENA)));
  },

  "asteroid|asteroid"(_world, a, b) {
    const { normal, overlap } = pushApart(a, b);
    a.pos = a.pos.sub(normal.scale(overlap / 2));
    b.pos = b.pos.add(normal.scale(overlap / 2));
    const va = a.vel.dot(normal);
    const vb = b.vel.dot(normal);
    if (va - vb <= 0) return;
    a.vel = a.vel.add(normal.scale(vb - va));
    b.vel = b.vel.add(normal.scale(va - vb));
  },
};

export function resolveCollisions(world, pairs) {
  for (const [first, second] of pairs) {
    if (!first.alive || !second.alive) continue;
    const [name, a, b] = key(first, second);
    handlers[name]?.(world, a, b);
  }
}
