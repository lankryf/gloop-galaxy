import type { Seq } from "@gloop/shared/ids.ts";
import { seq } from "@gloop/shared/ids.ts";
import type { InputRecord } from "@gloop/shared/protocol.ts";
import { packButtons } from "@gloop/shared/protocol.ts";
import { ARENA } from "@gloop/shared/sim/arena.ts";
import type { Rng } from "@gloop/shared/sim/random.ts";
import { createRng } from "@gloop/shared/sim/random.ts";
import type { Controls, Ship } from "@gloop/shared/sim/ship.ts";
import { IDLE } from "@gloop/shared/sim/ship.ts";
import type { World } from "@gloop/shared/sim/world.ts";

const BOT_NAMES = ["Блимп", "Шмяк", "Зорг", "Пухлик", "Гугл-Гугл", "Мімі", "Бульк", "Кракен"];

export interface Target {
  readonly dx: number;
  readonly dy: number;
  readonly distance: number;
}

function delta(a: number, b: number, size: number): number {
  let d = b - a;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
}

export function toward(ship: Ship, x: number, y: number): Target {
  const dx = delta(ship.pos.x, x, ARENA.width);
  const dy = delta(ship.pos.y, y, ARENA.height);
  return { dx, dy, distance: Math.hypot(dx, dy) };
}

export function angleTo(ship: Ship, target: Target): number {
  let diff = Math.atan2(target.dy, target.dx) - ship.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function steerTo(diff: number, slack: number): Pick<Controls, "left" | "right"> {
  return { left: diff < -slack, right: diff > slack };
}

function danger(world: World, ship: Ship): Target | null {
  let worst: Target | null = null;
  let worstScore = 0;
  for (const e of world) {
    if (!e.alive || e === ship) continue;
    let reach = 0;
    if (e.kind === "well") reach = e.radius + (e.solid ? 90 : 170);
    else if (e.kind === "asteroid") reach = e.radius + 70;
    else continue;
    const t = toward(ship, e.pos.x, e.pos.y);
    if (t.distance > reach) continue;
    const score = reach / Math.max(1, t.distance);
    if (score > worstScore) {
      worstScore = score;
      worst = t;
    }
  }
  return worst;
}

function prey(world: World, ship: Ship): Target | null {
  let best: Target | null = null;
  for (const other of world.ofKind("ship")) {
    if (other === ship || other.dead) continue;
    const t = toward(ship, other.pos.x, other.pos.y);
    if (!best || t.distance < best.distance) best = t;
  }
  if (best && best.distance < 800) return best;
  for (const rock of world.ofKind("asteroid")) {
    const t = toward(ship, rock.pos.x, rock.pos.y);
    if (!best || t.distance < best.distance) best = t;
  }
  return best;
}

export function decide(world: World, ship: Ship, rng: Rng): Controls {
  if (ship.dead) return IDLE;

  const threat = danger(world, ship);
  if (threat) {
    const away = angleTo(ship, { dx: -threat.dx, dy: -threat.dy, distance: threat.distance });
    return { ...steerTo(away, 0.3), thrust: Math.abs(away) < 1.2, fire: false };
  }

  const target = prey(world, ship);
  if (!target) return { ...IDLE, thrust: rng.next() < 0.5 };
  const diff = angleTo(ship, target);
  return {
    ...steerTo(diff, 0.08),
    thrust: target.distance > 260 && Math.abs(diff) < 0.9,
    fire: Math.abs(diff) < 0.18 && target.distance < 650 && rng.next() < 0.7,
  };
}

export class Bot {
  readonly playerId: string;
  readonly name: string;
  readonly rng: Rng;
  #seq = 0;

  constructor(playerId: string, index: number) {
    this.playerId = playerId;
    const base = BOT_NAMES[index % BOT_NAMES.length] ?? "Бот";
    const round = Math.floor(index / BOT_NAMES.length);
    this.name = round === 0 ? base : `${base} ${round + 1}`;
    this.rng = createRng(index + 1);
  }

  think(world: World, ship: Ship): InputRecord {
    this.#seq += 1;
    const next: Seq = seq(this.#seq);
    return { seq: next, buttons: packButtons(decide(world, ship, this.rng)) };
  }
}
