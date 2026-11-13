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

export const PULL = { radius: 30, range: 750, strength: 7e6 };

export function pullField(x: number, y: number): WellField {
  return { x, y, ...PULL };
}

export function gravityFields(world: World, except: unknown = null): WellField[] {
  const fields: WellField[] = [];
  for (const well of world.ofKind("well")) fields.push(well.field);
  for (const asteroid of world.ofKind("asteroid"))
    fields.push(bodyField(asteroid.pos.x, asteroid.pos.y, asteroid.radius));
  for (const pickup of world.ofKind("pickup"))
    fields.push(bodyField(pickup.pos.x, pickup.pos.y, pickup.radius));
  for (const ship of world.ofKind("ship")) {
    if (ship !== except && !ship.dead && ship.effects.has("pull"))
      fields.push(pullField(ship.pos.x, ship.pos.y));
  }
  return fields;
}

export function applyGravity(world: World, dt: number): void {
  const all = gravityFields(world);
  if (all.length === 0) return;
  const pulls: WellField[] = [];
  const natural: WellField[] = [];
  for (const field of all)
    (field.strength === PULL.strength && field.range === PULL.range ? pulls : natural).push(field);

  for (const entity of world) {
    if (!entity.alive) continue;
    const fields =
      entity.kind === "asteroid" || entity.kind === "missile"
        ? all
        : entity.kind === "bullet"
          ? natural
          : entity.kind === "pickup"
            ? pulls
            : null;
    if (!fields || fields.length === 0) continue;
    const { ax, ay } = gravityAt(entity.pos.x, entity.pos.y, fields);
    if (ax !== 0 || ay !== 0) {
      entity.vel = entity.vel.add({ x: ax * dt, y: ay * dt });
    }
  }
}
