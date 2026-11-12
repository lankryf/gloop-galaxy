import { ARENA } from "@gloop/shared/sim/arena.js";
import { lerpAngle, lerpWrapped } from "../render/draw.js";

const KEEP = 90;
const OFFSET_WINDOW = 90;

export class SnapshotBuffer {
  #snapshots = [];
  #offsets = [];

  constructor({ tickMs, delayMs = 100 }) {
    this.tickMs = tickMs;
    this.delayMs = delayMs;
    this.lastReceivedAt = 0;
    this.samples = 0;
    this.starved = 0;
  }

  get latest() {
    return this.#snapshots.at(-1) ?? null;
  }

  push(snapshot, now) {
    const latest = this.latest;
    if (latest && snapshot.tick <= latest.tick) return false;
    this.#snapshots.push(snapshot);
    if (this.#snapshots.length > KEEP) this.#snapshots.shift();
    this.#offsets.push(now - snapshot.tick * this.tickMs);
    if (this.#offsets.length > OFFSET_WINDOW) this.#offsets.shift();
    this.lastReceivedAt = now;
    return true;
  }

  serverTick(now) {
    if (this.#offsets.length === 0) return 0;
    return (now - Math.min(...this.#offsets)) / this.tickMs;
  }

  renderTick(now) {
    return this.serverTick(now) - this.delayMs / this.tickMs;
  }

  sample(now) {
    const list = this.#snapshots;
    if (list.length === 0) return { entities: [], tick: 0 };
    const target = this.renderTick(now);
    this.samples += 1;
    if (target <= list[0].tick) return { entities: list[0].entities, tick: list[0].tick };
    if (target >= list.at(-1).tick) {
      this.starved += 1;
      return { entities: list.at(-1).entities, tick: list.at(-1).tick, stale: true };
    }

    let i = list.length - 2;
    while (i > 0 && list[i].tick > target) i--;
    const a = list[i];
    const b = list[i + 1];
    const t = (target - a.tick) / (b.tick - a.tick);
    const before = new Map(a.entities.map((e) => [e.id, e]));
    const entities = [];
    for (const next of b.entities) {
      const prev = before.get(next.id);
      if (!prev || prev.kind !== next.kind) {
        if (t > 0.5) entities.push(next);
        continue;
      }
      entities.push({
        ...next,
        x: lerpWrapped(prev.x, next.x, t, ARENA.width),
        y: lerpWrapped(prev.y, next.y, t, ARENA.height),
        angle: next.angle === undefined ? undefined : lerpAngle(prev.angle, next.angle, t),
      });
    }
    return { entities, tick: target };
  }
}
