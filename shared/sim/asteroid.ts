import type { ArenaSize } from "./arena.ts";
import { homing } from "./behaviors.ts";
import { Entity } from "./entity.ts";
import type { Rng } from "./random.ts";
import { Vector2 } from "./vector.ts";
import type { World } from "./world.ts";

export class Asteroid extends Entity {
  readonly kind = "asteroid";
  readonly spin: number;
  readonly shape: readonly number[];
  hp: number;
  hunter = false;

  constructor({ pos, vel, radius, rng }: { pos: Vector2; vel: Vector2; radius: number; rng: Rng }) {
    super({ pos, vel, radius });
    this.spin = rng.range(-1.2, 1.2);
    this.hp = radius > 42 ? 3 : radius > 28 ? 2 : 1;
    this.shape = Array.from({ length: 11 }, () => rng.range(0.78, 1.12));
  }

  override update(dt: number, world: World): void {
    super.update(dt, world);
    this.angle += this.spin * dt;
  }

  static random(rng: Rng, arena: ArenaSize, world: World | null = null): Asteroid {
    const radius = rng.range(20, 55);
    const spot = world?.findSafeSpot(radius, arena, 12);
    const pos = spot
      ? new Vector2(spot.x, spot.y)
      : new Vector2(rng.range(0, arena.width), rng.range(0, arena.height));
    const vel = Vector2.fromAngle(rng.range(0, Math.PI * 2), rng.range(25, 90));
    const asteroid = new Asteroid({ pos, vel, radius, rng });
    if (rng.next() < 0.2) {
      asteroid.hunter = true;
      asteroid.behaviors.push(homing({ turnRate: 0.6, range: 380 }));
    }
    return asteroid;
  }
}
