import { ARENA, wrap } from "@gloop/shared/sim/arena.js";
import { quantizeShip, shipPhysics } from "@gloop/shared/sim/ship.js";

function wrappedDelta(a, b, size) {
  let d = b - a;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
}

export function wellsAt(wells, ticksAhead, dt) {
  return wells.map((w) => ({
    ...w,
    x: wrap(w.x + w.vx * dt * ticksAhead, ARENA.width),
    y: wrap(w.y + w.vy * dt * ticksAhead, ARENA.height),
  }));
}

export class Predictor {
  constructor({ dt, smoothing = 0.1 }) {
    this.dt = dt;
    this.smoothing = smoothing;
    this.pending = [];
    this.state = null;
    this.previous = null;
    this.offset = { x: 0, y: 0 };
    this.lastCorrection = 0;
    this.corrections = [];
  }

  reset() {
    this.pending.length = 0;
    this.state = null;
    this.previous = null;
    this.offset = { x: 0, y: 0 };
  }

  apply(input, wells) {
    this.pending.push(input);
    if (!this.state) return;
    this.previous = this.state;
    this.state = shipPhysics(this.state, input.controls, this.dt, wellsAt(wells, 1, this.dt));
  }

  reconcile(serverShip, ack, wells) {
    while (this.pending.length > 0 && this.pending[0].seq <= ack) this.pending.shift();

    let state = quantizeShip({
      x: serverShip.x,
      y: serverShip.y,
      vx: serverShip.vx,
      vy: serverShip.vy,
      angle: serverShip.angle,
    });
    this.pending.forEach((input, i) => {
      state = shipPhysics(state, input.controls, this.dt, wellsAt(wells, i + 1, this.dt));
    });

    let error = 0;
    if (!this.state) {
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

  decay(frameSeconds) {
    const k = Math.exp(-frameSeconds / (this.smoothing / 3));
    this.offset = { x: this.offset.x * k, y: this.offset.y * k };
  }
}
