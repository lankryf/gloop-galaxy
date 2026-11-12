import { seq } from "@gloop/shared/ids.ts";
import { packButtons } from "@gloop/shared/protocol.ts";
import { IDLE, shipPhysics } from "@gloop/shared/sim/ship.ts";
import { describe, expect, test } from "vitest";
import type { PendingInput } from "../src/online/prediction.ts";
import { Predictor, replayInputs, wellsAt } from "../src/online/prediction.ts";

const dt = 1 / 30;
const thrust = { ...IDLE, thrust: true };
const input = (n: number, controls = thrust): PendingInput => ({
  seq: seq(n),
  controls,
  buttons: packButtons(controls),
});
const server = { x: 400, y: 300, vx: 0, vy: 0, angle: 0 };

describe("replayInputs", () => {
  test("with nothing pending it returns the server state", () => {
    expect(replayInputs(server, [], [], dt)).toMatchObject(server);
  });

  test("replaying N inputs equals stepping physics N times", () => {
    const pending = [input(1), input(2), input(3, { ...IDLE, left: true })];
    let expected = shipPhysics(server, thrust, dt, []);
    expected = shipPhysics(expected, thrust, dt, []);
    expected = shipPhysics(expected, { ...IDLE, left: true }, dt, []);
    expect(replayInputs(server, pending, [], dt)).toEqual(expected);
  });

  test("is pure: same arguments, same answer", () => {
    const pending = [input(1), input(2)];
    expect(replayInputs(server, pending, [], dt)).toEqual(replayInputs(server, pending, [], dt));
  });
});

describe("Predictor", () => {
  test("reconcile drops acknowledged inputs", () => {
    const p = new Predictor({ dt });
    for (let i = 1; i <= 5; i++) p.apply(input(i), []);
    p.reconcile(server, seq(3), []);
    expect(p.pending.map((i) => i.seq)).toEqual([4, 5]);
  });

  test("when the server agrees there is no correction", () => {
    const p = new Predictor({ dt });
    p.reconcile(server, seq(0), []);
    for (let i = 1; i <= 3; i++) p.apply(input(i), []);
    const truth = replayInputs(server, [input(1)], [], dt);
    p.reconcile(truth, seq(1), []);
    expect(p.lastCorrection).toBeLessThan(1e-3);
  });

  test("a disagreement is measured and smoothed, not snapped", () => {
    const p = new Predictor({ dt });
    p.reconcile(server, seq(0), []);
    p.apply(input(1), []);
    p.reconcile({ ...server, x: server.x + 30 }, seq(0), []);
    expect(p.lastCorrection).toBeGreaterThan(25);
    expect(Math.hypot(p.offset.x, p.offset.y)).toBeGreaterThan(25);
    p.decay(1);
    expect(Math.hypot(p.offset.x, p.offset.y)).toBeLessThan(1);
  });

  test("moving wells are extrapolated per tick", () => {
    const [w] = wellsAt(
      [{ x: 100, y: 100, vx: 30, vy: 0, radius: 26, range: 400, strength: 1 }],
      3,
      dt,
    );
    expect(w?.x).toBeCloseTo(103, 9);
  });
});
