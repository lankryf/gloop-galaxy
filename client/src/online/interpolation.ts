import type { EntitySnap, Snapshot } from "@gloop/shared/protocol.ts";
import { lerp, lerpAngle } from "../render/draw.ts";

const KEEP = 30;
const OFFSET_WINDOW = 90;

export interface Sampled {
  readonly entities: readonly EntitySnap[];
  readonly tick: number;
  readonly stale?: boolean;
}

function blendInto(out: EntitySnap, prev: EntitySnap, next: EntitySnap, t: number): EntitySnap {
  Object.assign(out, next);
  out.x = lerp(prev.x, next.x, t);
  out.y = lerp(prev.y, next.y, t);
  if ("angle" in out && "angle" in prev && "angle" in next)
    out.angle = lerpAngle(prev.angle, next.angle, t);
  return out;
}

export class SnapshotBuffer {
  #snapshots: Snapshot[] = [];
  #index = new WeakMap<Snapshot, Map<number, EntitySnap>>();
  #scratch = new Map<number, EntitySnap>();
  #out: EntitySnap[] = [];
  #minOffset = Number.POSITIVE_INFINITY;
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
    this.#index.set(snapshot, new Map(snapshot.entities.map((e) => [e.id, e])));
    if (this.#snapshots.length > KEEP) this.#snapshots.shift();
    this.#offsets.push(now - snapshot.tick * this.tickMs);
    if (this.#offsets.length > OFFSET_WINDOW) this.#offsets.shift();
    this.#minOffset = Number.POSITIVE_INFINITY;
    for (const o of this.#offsets) if (o < this.#minOffset) this.#minOffset = o;
    this.lastReceivedAt = now;
    return true;
  }

  serverTick(now: number): number {
    if (this.#offsets.length === 0) return 0;
    return (now - this.#minOffset) / this.tickMs;
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
    const before = this.#index.get(a);
    const entities = this.#out;
    entities.length = 0;
    for (const next of b.entities) {
      const prev = before?.get(next.id);
      if (!prev || prev.kind !== next.kind) {
        if (t > 0.5) entities.push(next);
        continue;
      }
      let out = this.#scratch.get(next.id);
      if (!out || out.kind !== next.kind) {
        out = { ...next };
        this.#scratch.set(next.id, out);
      }
      entities.push(blendInto(out, prev, next, t));
    }
    if (this.#scratch.size > entities.length * 2 + 64) this.#prune(b);
    return { entities, tick: target };
  }

  #prune(current: Snapshot): void {
    const alive = this.#index.get(current);
    for (const id of this.#scratch.keys()) if (!alive?.has(id)) this.#scratch.delete(id);
  }
}
