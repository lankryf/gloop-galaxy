import type { World } from "./world.ts";

export interface WellField {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly range: number;
  readonly strength: number;
}

export function gravityAt(
  x: number,
  y: number,
  wells: readonly WellField[],
): { ax: number; ay: number } {
  let ax = 0;
  let ay = 0;
  for (const well of wells) {
    const dx = well.x - x;
    const dy = well.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 === 0 || d2 > well.range * well.range) continue;
    const soft = well.radius * 1.5;
    const pull = well.strength / Math.max(d2, soft * soft);
    const d = Math.sqrt(d2) || 1;
    ax += (dx / d) * pull;
    ay += (dy / d) * pull;
  }
  return { ax, ay };
}

export const MICRO_GRAVITY = { strengthPerVolume: 5.4, rangePerRadius: 7 };

export function bodyField(x: number, y: number, radius: number): WellField {
  return {
    x,
    y,
    radius,
    range: radius * MICRO_GRAVITY.rangePerRadius,
    strength: MICRO_GRAVITY.strengthPerVolume * radius * radius * radius,
  };
}

export function gravityFields(world: World): WellField[] {
  const fields: WellField[] = [];
  for (const well of world.ofKind("well")) fields.push(well.field);
  for (const asteroid of world.ofKind("asteroid"))
    fields.push(bodyField(asteroid.pos.x, asteroid.pos.y, asteroid.radius));
  for (const pickup of world.ofKind("pickup"))
    fields.push(bodyField(pickup.pos.x, pickup.pos.y, pickup.radius));
  return fields;
}

export function applyGravity(world: World, dt: number): void {
  const wells = gravityFields(world);
  if (wells.length === 0) return;

  for (const entity of world) {
    if (!entity.alive || (entity.kind !== "bullet" && entity.kind !== "asteroid")) continue;
    const { ax, ay } = gravityAt(entity.pos.x, entity.pos.y, wells);
    if (ax !== 0 || ay !== 0) {
      entity.vel = entity.vel.add({ x: ax * dt, y: ay * dt });
    }
  }
}
