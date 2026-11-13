type Ctx = CanvasRenderingContext2D;

export type BlastKind = "nuke" | "collapse" | "warpOut" | "warpIn";

interface Spark {
  readonly angle: number;
  readonly speed: number;
  readonly length: number;
}

const LOOK: Readonly<
  Record<BlastKind, { duration: number; sparks: number; core: string; mid: string; ring: string }>
> = {
  nuke: { duration: 1.8, sparks: 60, core: "#fffdf2", mid: "#ffb347", ring: "180, 220, 255" },
  collapse: { duration: 2.4, sparks: 80, core: "#f6eaff", mid: "#9b5cff", ring: "200, 160, 255" },
  warpOut: { duration: 0.6, sparks: 24, core: "#e8fbff", mid: "#4fd8ff", ring: "120, 220, 255" },
  warpIn: { duration: 0.8, sparks: 24, core: "#e8fbff", mid: "#4fd8ff", ring: "120, 220, 255" },
};

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export class Blast {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly kind: BlastKind;
  readonly sparks: readonly Spark[];
  age = 0;

  constructor(x: number, y: number, radius: number, kind: BlastKind, random: () => number) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.kind = kind;
    this.sparks = Array.from({ length: LOOK[kind].sparks }, () => ({
      angle: random() * Math.PI * 2,
      speed: 0.45 + random() * 0.75,
      length: 0.03 + random() * 0.08,
    }));
  }

  get duration(): number {
    return LOOK[this.kind].duration;
  }

  get done(): boolean {
    return this.age >= this.duration;
  }

  update(dt: number): void {
    this.age += dt;
  }
}

function glow(ctx: Ctx, x: number, y: number, r: number, stops: readonly [number, string][]): void {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function implode(ctx: Ctx, b: Blast, t: number): void {
  const look = LOOK[b.kind];
  const r = b.radius * 0.6 * (1 - t);
  ctx.strokeStyle = `rgba(${look.ring}, ${0.3 + 0.6 * t})`;
  ctx.lineWidth = 2 + 6 * t;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.stroke();
  glow(ctx, b.x, b.y, b.radius * 0.25 * t + 10, [
    [0, look.core],
    [1, "rgba(0, 0, 0, 0)"],
  ]);
}

export function drawBlast(ctx: Ctx, b: Blast): void {
  const look = LOOK[b.kind];
  const t = Math.min(1, b.age / b.duration);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  if (b.kind === "warpOut") {
    implode(ctx, b, t);
    ctx.restore();
    return;
  }

  const pre = b.kind === "collapse" ? 0.18 : 0;
  if (t < pre) {
    implode(ctx, b, t / pre);
    ctx.restore();
    return;
  }
  const k = (t - pre) / (1 - pre);
  const grow = easeOut(k);
  const fade = 1 - k;

  if (k < 0.12) {
    ctx.globalAlpha = 1 - k / 0.12;
    glow(ctx, b.x, b.y, b.radius * 1.3, [
      [0, "rgba(255, 255, 255, 0.95)"],
      [0.3, "rgba(255, 255, 255, 0.35)"],
      [1, "rgba(255, 255, 255, 0)"],
    ]);
  }

  ctx.globalAlpha = fade ** 1.4;
  glow(ctx, b.x, b.y, b.radius * (0.15 + 0.3 * grow), [
    [0, look.core],
    [0.35, look.mid],
    [1, "rgba(0, 0, 0, 0)"],
  ]);

  ctx.globalAlpha = 1;
  ctx.strokeStyle = `rgba(${look.ring}, ${0.85 * fade})`;
  ctx.lineWidth = 2 + 10 * fade;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.radius * grow, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${look.ring}, ${0.35 * fade})`;
  ctx.lineWidth = 1 + 24 * fade;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.radius * grow * 0.92, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = look.mid;
  ctx.lineCap = "round";
  ctx.lineWidth = 2;
  ctx.globalAlpha = fade;
  for (const s of b.sparks) {
    const d = b.radius * s.speed * grow;
    const len = b.radius * s.length * fade + 2;
    const cos = Math.cos(s.angle);
    const sin = Math.sin(s.angle);
    ctx.beginPath();
    ctx.moveTo(b.x + cos * d, b.y + sin * d);
    ctx.lineTo(b.x + cos * (d + len), b.y + sin * (d + len));
    ctx.stroke();
  }
  ctx.restore();
}

export function drawWarpCharge(
  ctx: Ctx,
  x: number,
  y: number,
  angle: number,
  progress: number,
  distance: number,
  time: number,
): void {
  const p = Math.max(0, Math.min(1, progress));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  for (let i = 0; i < 3; i++) {
    const r = 70 - 40 * p + i * 14;
    ctx.strokeStyle = `rgba(120, 220, 255, ${0.25 + 0.5 * p})`;
    ctx.lineWidth = 2 + 2 * p;
    ctx.beginPath();
    const start = time / (300 - 200 * p) + (i * Math.PI * 2) / 3;
    ctx.arc(0, 0, r, start, start + Math.PI * (0.6 + 0.6 * p));
    ctx.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39996 + time / 900;
    const phase = (time / 500 + i / 16) % 1;
    const d = 120 * (1 - phase);
    ctx.strokeStyle = `rgba(200, 245, 255, ${0.6 * phase * (0.4 + p)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
    ctx.lineTo(Math.cos(a) * (d + 14), Math.sin(a) * (d + 14));
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 40 + 30 * p);
  g.addColorStop(0, `rgba(200, 245, 255, ${0.2 + 0.5 * p})`);
  g.addColorStop(1, "rgba(79, 216, 255, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 40 + 30 * p, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(angle);
  ctx.setLineDash([10, 16]);
  ctx.lineDashOffset = -time / 20;
  ctx.strokeStyle = `rgba(120, 220, 255, ${0.15 + 0.35 * p})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 0);
  ctx.lineTo(distance, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(distance, 0, 30 + 10 * Math.sin(time / 120), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
