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

function bounceOff(well, body) {
  const { normal, overlap } = pushApart(well, body);
  body.pos = body.pos.add(normal.scale(overlap + 1));
  const vn = body.vel.dot(normal);
  if (vn < 0) body.vel = body.vel.sub(normal.scale(vn * 1.8));
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
    world.spawn(Asteroid.random(world.rng, ARENA, world));
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

  "bullet|well"(world, bullet, well) {
    bullet.alive = false;
    if (!well.solid) world.emit("swallowed", { x: well.pos.x, y: well.pos.y, kind: "bullet" });
  },

  "asteroid|well"(world, asteroid, well) {
    if (well.solid) {
      bounceOff(well, asteroid);
      return;
    }
    asteroid.alive = false;
    world.emit("swallowed", { x: well.pos.x, y: well.pos.y, kind: "asteroid" });
    world.later(2, (w) => w.spawn(Asteroid.random(w.rng, ARENA, w)));
  },

  "ship|well"(world, ship, well) {
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
  },
};

export function resolveCollisions(world, pairs) {
  for (const [first, second] of pairs) {
    if (!first.alive || !second.alive) continue;
    const [name, a, b] = key(first, second);
    handlers[name]?.(world, a, b);
  }
}
