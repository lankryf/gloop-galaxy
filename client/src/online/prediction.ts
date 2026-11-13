import type { Seq } from "@gloop/shared/ids.ts";
import type { WellSnap } from "@gloop/shared/protocol.ts";
import { ARENA } from "@gloop/shared/sim/arena.ts";
import type { WellField } from "@gloop/shared/sim/gravity.ts";
import { bodyField } from "@gloop/shared/sim/gravity.ts";
import type { Controls, MovedShip, ShipState } from "@gloop/shared/sim/ship.ts";
import { quantizeShip, shipPhysics } from "@gloop/shared/sim/ship.ts";
import { WELLS } from "@gloop/shared/sim/well.ts";

export interface PendingInput {
  readonly seq: Seq;
  readonly controls: Controls;
  readonly buttons: number;
}

export interface MovingWell extends WellField {
  readonly vx: number;
  readonly vy: number;
}

export function bodyAt(x: number, y: number, radius: number): MovingWell {
  return { ...bodyField(x, y, radius), vx: 0, vy: 0 };
}

export function toWellField(e: WellSnap): MovingWell {
  const config = WELLS[e.type];
  return {
    x: e.x,
    y: e.y,
    vx: e.vx,
    vy: e.vy,
    radius: config.radius,
    range: config.range,
    strength: config.strength,
  };
}

function wrappedDelta(a: number, b: number, size: number): number {
  let d = b - a;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
}

export function wellsAt(
  wells: readonly MovingWell[],
  ticksAhead: number,
  dt: number,
): MovingWell[] {
  return wells.map((w) => ({
    ...w,
    x: w.x + w.vx * dt * ticksAhead,
    y: w.y + w.vy * dt * ticksAhead,
  }));
}

export function replayInputs(
  serverShip: ShipState,
  pending: readonly PendingInput[],
  wells: readonly MovingWell[],
  dt: number,
): MovedShip {
  let state: MovedShip = quantizeShip({
    x: serverShip.x,
    y: serverShip.y,
    vx: serverShip.vx,
    vy: serverShip.vy,
    angle: serverShip.angle,
    thrust: false,
  });
  pending.forEach((input, i) => {
    state = shipPhysics(state, input.controls, dt, wellsAt(wells, i + 1, dt));
  });
  return state;
}

export class Predictor {
  readonly dt: number;
  readonly smoothing: number;
  readonly pending: PendingInput[] = [];
  state: MovedShip | null = null;
  previous: ShipState | null = null;
  offset = { x: 0, y: 0 };
  lastCorrection = 0;
  readonly corrections: number[] = [];

  constructor({ dt, smoothing = 0.1 }: { dt: number; smoothing?: number }) {
    this.dt = dt;
    this.smoothing = smoothing;
  }

  reset(): void {
    this.pending.length = 0;
    this.state = null;
    this.previous = null;
    this.offset = { x: 0, y: 0 };
  }

  trim(ack: Seq): void {
    while ((this.pending[0]?.seq ?? Number.POSITIVE_INFINITY) <= ack) this.pending.shift();
  }

  apply(input: PendingInput, wells: readonly MovingWell[]): void {
    this.pending.push(input);
    if (!this.state) return;
    this.previous = this.state;
    this.state = shipPhysics(this.state, input.controls, this.dt, wellsAt(wells, 1, this.dt));
  }

  reconcile(serverShip: ShipState, ack: Seq, wells: readonly MovingWell[]): void {
    this.trim(ack);

    const state = replayInputs(serverShip, this.pending, wells, this.dt);

    let error = 0;
    if (!this.state || !this.previous) {
      this.previous = state;
    } else {
      const dx = wrappedDelta(state.x, this.state.x, ARENA.width);
      const dy = wrappedDelta(state.y, this.state.y, ARENA.height);
      error = Math.hypot(dx, dy);
      if (error > 200) {
        this.offset = { x: 0, y: 0 };
        this.previous = state;
      } else {
        this.offset = { x: this.offset.x + dx, y: this.offset.y + dy };
        this.previous = { ...this.previous, x: this.previous.x - dx, y: this.previous.y - dy };
      }
    }
    this.lastCorrection = error;
    this.corrections.push(error);
    if (this.corrections.length > 120) this.corrections.shift();
    this.state = state;
  }

  decay(frameSeconds: number): void {
    const k = Math.exp(-frameSeconds / (this.smoothing / 3));
    this.offset = { x: this.offset.x * k, y: this.offset.y * k };
  }
}
