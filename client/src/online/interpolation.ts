import type { EntitySnap, Snapshot } from "@gloop/shared/protocol.ts";
import { ARENA } from "@gloop/shared/sim/arena.ts";
import { lerpAngle, lerpWrapped } from "../render/draw.ts";

const KEEP = 90;
const OFFSET_WINDOW = 90;

export interface Sampled {
  readonly entities: readonly EntitySnap[];
  readonly tick: number;
  readonly stale?: boolean;
}

function blend(prev: EntitySnap, next: EntitySnap, t: number): EntitySnap {
  const x = lerpWrapped(prev.x, next.x, t, ARENA.width);
  const y = lerpWrapped(prev.y, next.y, t, ARENA.height);
  if ("angle" in next && "angle" in prev)
    return { ...next, x, y, angle: lerpAngle(prev.angle, next.angle, t) };
  return { ...next, x, y };
}

export class SnapshotBuffer {
  #snapshots: Snapshot[] = [];
  #offsets: number[] = [];
  readonly tickMs: number;
  delayMs: number;
  lastReceivedAt = 0;
  samples = 0;
  starved = 0;

  constructor({ tickMs, delayMs = 100 }: { tickMs: number; delayMs?: number }) {
    this.tickMs = tickMs;
    this.delayMs = delayMs;
  }

  get latest(): Snapshot | null {
    return this.#snapshots.at(-1) ?? null;
  }

  push(snapshot: Snapshot, now: number): boolean {
    const latest = this.latest;
    if (latest && snapshot.tick <= latest.tick) return false;
    this.#snapshots.push(snapshot);
    if (this.#snapshots.length > KEEP) this.#snapshots.shift();
    this.#offsets.push(now - snapshot.tick * this.tickMs);
    if (this.#offsets.length > OFFSET_WINDOW) this.#offsets.shift();
    this.lastReceivedAt = now;
    return true;
  }

  serverTick(now: number): number {
    if (this.#offsets.length === 0) return 0;
    return (now - Math.min(...this.#offsets)) / this.tickMs;
  }

  renderTick(now: number): number {
    return this.serverTick(now) - this.delayMs / this.tickMs;
  }

  sample(now: number): Sampled {
    const list = this.#snapshots;
    const first = list[0];
    const last = list.at(-1);
    if (!first || !last) return { entities: [], tick: 0 };
    const target = this.renderTick(now);
    this.samples += 1;
    if (target <= first.tick) return { entities: first.entities, tick: first.tick };
    if (target >= last.tick) {
      this.starved += 1;
      return { entities: last.entities, tick: last.tick, stale: true };
    }

    let i = list.length - 2;
    while (i > 0 && (list[i]?.tick ?? 0) > target) i--;
    const a = list[i];
    const b = list[i + 1];
    if (!a || !b) return { entities: last.entities, tick: last.tick, stale: true };
    const t = (target - a.tick) / (b.tick - a.tick);
    const before = new Map(a.entities.map((e) => [e.id, e]));
    const entities: EntitySnap[] = [];
    for (const next of b.entities) {
      const prev = before.get(next.id);
      if (!prev || prev.kind !== next.kind) {
        if (t > 0.5) entities.push(next);
        continue;
      }
      entities.push(blend(prev, next, t));
    }
    return { entities, tick: target };
  }
}
