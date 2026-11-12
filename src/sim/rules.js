import { ARENA } from "./arena.js";
import { Asteroid } from "./asteroid.js";
import { Explosion } from "./explosion.js";

const SCORE = { asteroid: 10, ship: 100 };

function key(a, b) {
  return a.kind < b.kind ? [`${a.kind}|${b.kind}`, a, b] : [`${b.kind}|${a.kind}`, b, a];
}

function credit(world, ownerId, points) {
  const owner = world.get(ownerId);
  if (owner?.kind === "ship") owner.score += points;
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
    if (asteroid.hp > 0) return;
    asteroid.alive = false;
    credit(world, bullet.ownerId, SCORE.asteroid);
    world.spawn(
      new Explosion({
        pos: asteroid.pos,
        rng: world.rng,
        size: asteroid.radius / 35,
        color: "#b49ad1",
      }),
    );
    world.spawn(Asteroid.random(world.rng, ARENA));
  },

  "bullet|ship"(world, bullet, ship) {
    if (bullet.ownerId === ship.id || ship.dead) return;
    bullet.alive = false;
    if (ship.damage(bullet.damage)) {
      credit(world, bullet.ownerId, SCORE.ship);
      world.spawn(new Explosion({ pos: ship.pos, rng: world.rng, size: 1.4 }));
    }
  },

  "asteroid|ship"(world, asteroid, ship) {
    if (ship.dead) return;
    const { normal, overlap } = pushApart(asteroid, ship);
    ship.pos = ship.pos.add(normal.scale(overlap));
    ship.vel = normal.scale(Math.max(160, ship.vel.length() * 0.6));
    if (ship.damage(20)) {
      world.spawn(new Explosion({ pos: ship.pos, rng: world.rng, size: 1.4 }));
    }
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
