import { entityId, seq, tick } from "@gloop/shared/ids.ts";
import type { Snapshot } from "@gloop/shared/protocol.ts";
import { describe, expect, test } from "vitest";
import { SnapshotBuffer } from "../src/online/interpolation.ts";
import { lerpAngle, lerpWrapped } from "../src/render/draw.ts";

const snap = (t: number, x: number): Snapshot => ({
  tick: tick(t),
  ack: seq(0),
  entities: [{ kind: "pickup", id: entityId(1), x, y: 100, type: "shield" }],
  events: [],
});

describe("SnapshotBuffer", () => {
  test("old or repeated snapshots are rejected", () => {
    const b = new SnapshotBuffer({ tickMs: 33 });
    expect(b.push(snap(5, 0), 0)).toBe(true);
    expect(b.push(snap(5, 0), 1)).toBe(false);
    expect(b.push(snap(4, 0), 2)).toBe(false);
  });

  test("samples halfway between two snapshots", () => {
    const b = new SnapshotBuffer({ tickMs: 100, delayMs: 0 });
    b.push(snap(0, 0), 0);
    b.push(snap(1, 100), 100);
    b.push(snap(2, 200), 200);
    expect(b.sample(150).entities[0]?.x).toBeCloseTo(150, 6);
  });

  test("running out of snapshots is counted as starved", () => {
    const b = new SnapshotBuffer({ tickMs: 100, delayMs: 0 });
    b.push(snap(0, 0), 0);
    b.push(snap(1, 100), 100);
    const s = b.sample(500);
    expect(s.stale).toBe(true);
    expect(b.starved).toBe(1);
  });

  test("the delay shifts the render time back", () => {
    const b = new SnapshotBuffer({ tickMs: 100, delayMs: 100 });
    for (let t = 0; t <= 5; t++) b.push(snap(t, t * 10), t * 100);
    expect(b.renderTick(500)).toBeCloseTo(4, 9);
  });
});

describe("lerp helpers", () => {
  test("lerpWrapped takes the short way across the edge", () => {
    expect(lerpWrapped(1590, 10, 0.5, 1600)).toBeCloseTo(0, 9);
  });

  test("lerpAngle takes the short way across PI", () => {
    expect(Math.abs(lerpAngle(3, -3, 0.5))).toBeCloseTo(Math.PI, 1);
  });
});
