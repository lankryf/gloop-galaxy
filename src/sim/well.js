import { ARENA } from "./arena.js";
import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export const WELLS = {
  blackhole: { radius: 26, range: 460, strength: 1.2e7, solid: false, life: 30, spin: 2.5 },
  planet: {
    radius: 64,
    range: 340,
    strength: 4e6,
    solid: true,
    life: Number.POSITIVE_INFINITY,
    spin: 0.08,
  },
};

export class GravityWell extends Entity {
  constructor({ pos, vel = new Vector2(), type }) {
    const config = WELLS[type];
    super({ kind: "well", pos, vel, radius: config.radius });
    this.type = type;
    this.range = config.range;
    this.strength = config.strength;
    this.solid = config.solid;
    this.life = config.life;
    this.spin = config.spin;
    this.age = 0;
  }

  get timeLeft() {
    return this.life - this.age;
  }

  update(dt, world) {
    super.update(dt);
    this.angle += this.spin * dt;
    this.age += dt;
    if (this.age < this.life) return;
    this.alive = false;
    world.emit("collapsed", { x: this.pos.x, y: this.pos.y });
    world.later(4, (w) => w.spawn(GravityWell.drifting(w)));
  }

  static fromConfig({ type, x, y, drift = [0, 0] }, arena = ARENA) {
    return new GravityWell({
      type,
      pos: new Vector2(x * arena.width, y * arena.height),
      vel: new Vector2(drift[0], drift[1]),
    });
  }

  static drifting(world, arena = ARENA) {
    const spot = world.findSafeSpot(WELLS.blackhole.range * 0.4, arena);
    const vel = Vector2.fromAngle(world.rng.range(0, Math.PI * 2), world.rng.range(8, 22));
    return new GravityWell({ type: "blackhole", pos: new Vector2(spot.x, spot.y), vel });
  }
}
