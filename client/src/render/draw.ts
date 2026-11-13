import type { ArenaSize } from "@gloop/shared/sim/arena.ts";
import type { PickupType } from "@gloop/shared/sim/pickup.ts";
import type { Point } from "@gloop/shared/sim/vector.ts";
import type { WellType } from "@gloop/shared/sim/well.ts";
import type { Frame, Theme } from "../assets/manifest.ts";
import type { LoopStats } from "../loop.ts";
import type { View } from "./canvas.ts";

type Ctx = CanvasRenderingContext2D;

export interface SpriteSheet {
  readonly image: ImageBitmap;
  readonly frames: Readonly<Record<string, Frame>>;
}
export type Sprites = Readonly<Record<string, SpriteSheet>>;

export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface ShipPose extends Pose {
  readonly thrust: boolean;
}

export interface Moving {
  readonly pos: Point;
  readonly prevPos: Point;
  readonly angle: number;
  readonly prevAngle: number;
}

export interface AsteroidLook {
  readonly id: number;
  readonly radius: number;
  readonly hunter: boolean;
  readonly shape?: readonly number[];
}

export interface PickupLook {
  readonly pos: Point;
  readonly type: PickupType;
  readonly age: number;
  readonly radius: number;
}

export interface WellLook {
  readonly id?: number;
  readonly type: WellType;
  readonly range: number;
  readonly radius: number;
  readonly timeLeft: number;
}

export interface ExplosionLook {
  readonly ttl: number;
  readonly duration: number;
  readonly color: string;
  readonly count: number;
  readonly particles: readonly { readonly x: number; readonly y: number; readonly r: number }[];
}

interface Star {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly a: number;
}

const GOO = "#8dff3a";
const INK = "#1a0b26";

function makeStars(width: number, height: number, count: number): Star[] {
  const stars: Star[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    stars.push({ x: rand() * width, y: rand() * height, r: rand() * 1.8 + 0.4, a: rand() });
  }
  return stars;
}

let stars: Star[] | null = null;

const NEBULAE: readonly (readonly [number, number])[] = [
  [0.25, 0.3],
  [0.7, 0.65],
];

const DEFAULT_THEME: Pick<Theme, "background" | "planet" | "tile"> = {
  background: ["#3d1b63", "#140a24"],
  planet: { x: 0.82, y: 0.2, r: 70, color: "#ff7ad9" },
};

interface CachedBackground {
  readonly canvas: HTMLCanvasElement;
  readonly theme: object;
  readonly pixels: number;
}

let cachedBackground: CachedBackground | null = null;

type BackgroundTheme = Pick<Theme, "background" | "planet" | "tile">;

export function drawCachedBackground(
  ctx: Ctx,
  arena: ArenaSize,
  view: View,
  theme: BackgroundTheme = DEFAULT_THEME,
  sprites: Sprites | null = null,
): void {
  const pixels = Math.min(1, view.scale * view.dpr);
  if (cachedBackground?.theme !== theme || cachedBackground.pixels !== pixels) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(arena.width * pixels);
    canvas.height = Math.ceil(arena.height * pixels);
    const off = canvas.getContext("2d");
    if (!off) {
      drawBackground(ctx, arena, theme, sprites);
      return;
    }
    off.scale(pixels, pixels);
    drawBackground(off, arena, theme, sprites);
    cachedBackground = { canvas, theme, pixels };
  }
  ctx.drawImage(cachedBackground.canvas, 0, 0, arena.width, arena.height);
}

function tilePattern(ctx: Ctx, sheet: SpriteSheet, name: string): CanvasPattern | null {
  const frame = sheet.frames[name];
  if (!frame) return null;
  const tile = document.createElement("canvas");
  tile.width = frame[2];
  tile.height = frame[3];
  tile
    .getContext("2d")
    ?.drawImage(sheet.image, frame[0], frame[1], frame[2], frame[3], 0, 0, frame[2], frame[3]);
  return ctx.createPattern(tile, "repeat");
}

export function drawBackground(
  ctx: Ctx,
  arena: ArenaSize,
  theme: BackgroundTheme = DEFAULT_THEME,
  sprites: Sprites | null = null,
): void {
  const [inner, outer] = theme.background;
  const pattern =
    sprites?.backgrounds && theme.tile ? tilePattern(ctx, sprites.backgrounds, theme.tile) : null;
  ctx.fillStyle = pattern ?? outer;
  ctx.fillRect(0, 0, arena.width, arena.height);
  const reach = Math.min(arena.width, arena.height) / 2;
  for (const [fx, fy] of NEBULAE) {
    const cx = arena.width * fx;
    const cy = arena.height * fy;
    const g = ctx.createRadialGradient(cx, cy, 30, cx, cy, reach);
    g.addColorStop(0, inner);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = pattern ? 0.35 : 0.55;
    ctx.fillStyle = g;
    ctx.fillRect(cx - reach, cy - reach, reach * 2, reach * 2);
  }
  ctx.globalAlpha = 1;

  const { x, y, r, color, sprite } = theme.planet;
  const px = arena.width * x;
  const py = arena.height * y;
  const planets = sprites?.planets;
  if (planets && sprite) {
    ctx.globalAlpha = 0.55;
    drawSprite(ctx, planets, sprite, px, py, 0, (r * 2.4) / 150);
    ctx.globalAlpha = 1;
    return;
  }
  if (pattern) return;

  stars ??= makeStars(
    arena.width,
    arena.height,
    Math.round((220 * arena.width * arena.height) / (1600 * 900)),
  );
  for (const s of stars) {
    ctx.globalAlpha = 0.4 + s.a * 0.6;
    ctx.fillStyle = s.a > 0.85 ? GOO : "#f4e9ff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawSprite(
  ctx: Ctx,
  sheet: SpriteSheet,
  frameName: string,
  x: number,
  y: number,
  angle = 0,
  scale = 1,
): void {
  const frame = sheet.frames[frameName];
  if (!frame) return;
  const sx = frame[0];
  const sy = frame[1];
  const sw = frame[2];
  const sh = frame[3];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.drawImage(sheet.image, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function interpolate(entity: Moving, alpha: number): Pose {
  return {
    x: lerp(entity.prevPos.x, entity.pos.x, alpha),
    y: lerp(entity.prevPos.y, entity.pos.y, alpha),
    angle: lerpAngle(entity.prevAngle, entity.angle, alpha),
  };
}

export function interpolateShip(
  ship: Moving & { readonly thrust: boolean },
  alpha: number,
): ShipPose {
  return { ...interpolate(ship, alpha), thrust: ship.thrust };
}

export function drawName(ctx: Ctx, name: string, x: number, y: number, own: boolean): void {
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.fillStyle = own ? GOO : "#f4e9ff";
  ctx.strokeText(name, x, y - 42);
  ctx.fillText(name, x, y - 42);
  ctx.textAlign = "start";
}

const OTHER_SHIPS = ["other0", "other1", "other2", "other3"] as const;

export function shipFrame(id: number, own: boolean, bot = false): string {
  if (own) return "player";
  if (bot) return "dummy";
  return OTHER_SHIPS[id % OTHER_SHIPS.length] ?? "other0";
}

export function drawShip(
  ctx: Ctx,
  ship: ShipPose,
  time: number,
  own = true,
  sprites: Sprites | null = null,
  frame = own ? "player" : "dummy",
): void {
  if (sprites?.ships) {
    if (ship.thrust) {
      const back = -34 - Math.sin(time * 0.04) * 3;
      const flicker = 0.9 + Math.sin(time * 0.05) * 0.15;
      drawSprite(
        ctx,
        sprites.ships,
        "flame",
        ship.x + Math.cos(ship.angle) * back,
        ship.y + Math.sin(ship.angle) * back,
        ship.angle,
        flicker,
      );
    }
    drawSprite(ctx, sprites.ships, frame, ship.x, ship.y, ship.angle);
    return;
  }

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.scale(1.5, 1.5);

  if (ship.thrust) {
    const flicker = 10 + Math.sin(time * 0.05) * 6;
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.moveTo(-16, -8);
    ctx.lineTo(-30 - flicker, 0);
    ctx.lineTo(-16, 8);
    ctx.closePath();
    ctx.fill();
  }

  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;

  ctx.fillStyle = own ? "#b7b9c9" : "#ffb347";
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.quadraticCurveTo(10, -18, -18, -14);
  ctx.lineTo(-12, 0);
  ctx.lineTo(-18, 14);
  ctx.quadraticCurveTo(10, 18, 26, 0);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = GOO;
  ctx.beginPath();
  ctx.ellipse(4, 0, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ff5c5c";
  ctx.beginPath();
  ctx.arc(-14, -13, 4, 0, Math.PI * 2);
  ctx.arc(-14, 13, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function hudLines(stats: LoopStats, extra: readonly string[] = []): string[] {
  return [
    `steps/s  ${stats.stepsPerSecond}`,
    `frames/s ${stats.framesPerSecond}`,
    `frame    ${stats.frameTime.toFixed(2)} ms`,
    ...extra.filter(Boolean),
  ];
}

export function drawPanel(ctx: Ctx, view: View, lines: readonly string[]): void {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = "14px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "rgba(20, 8, 36, 0.7)";
  ctx.fillRect(10, 10, 190, 20 + lines.length * 18);
  ctx.fillStyle = GOO;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i] ?? "", 20, 32 + i * 18);
}

export function drawHud(
  ctx: Ctx,
  view: View,
  stats: LoopStats,
  extra: readonly string[] = [],
): void {
  drawPanel(ctx, view, hudLines(stats, extra));
}

export function drawBullet(ctx: Ctx, b: Pose, sprites: Sprites | null = null, own = true): void {
  if (sprites?.items) {
    drawSprite(ctx, sprites.items, own ? "bullet" : "enemyBullet", b.x, b.y, b.angle, 0.9);
    return;
  }
  ctx.fillStyle = GOO;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

const shapes = new Map<number, number[]>();

function shapeFor(id: number): readonly number[] {
  let shape = shapes.get(id);
  if (!shape) {
    let seed = id * 2654435761;
    shape = Array.from({ length: 11 }, () => {
      seed = (seed * 16807) % 2147483647;
      return 0.78 + (seed / 2147483647) * 0.34;
    });
    shapes.set(id, shape);
  }
  return shape;
}

export function drawAsteroid(
  ctx: Ctx,
  a: AsteroidLook,
  p: Pose,
  sprites: Sprites | null = null,
): void {
  if (sprites?.asteroids) {
    const frame = `${a.hunter ? "hunter" : "rock"}${a.id % 4}`;
    drawSprite(ctx, sprites.asteroids, frame, p.x, p.y, p.angle, a.radius / 50);
    return;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = a.hunter ? "#9c5a7a" : "#7a6a8f";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  const shape = a.shape ?? shapeFor(a.id);
  const n = shape.length;
  shape.forEach((k, i) => {
    const ang = (i / n) * Math.PI * 2;
    const r = a.radius * k;
    if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
    else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = a.hunter ? "#ff5c5c" : "#5b4d70";
  ctx.beginPath();
  ctx.arc(a.radius * 0.3, -a.radius * 0.2, a.radius * 0.22, 0, Math.PI * 2);
  ctx.arc(-a.radius * 0.35, a.radius * 0.25, a.radius * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawExplosion(ctx: Ctx, e: ExplosionLook): void {
  const t = e.ttl / e.duration;
  ctx.globalAlpha = Math.max(0, t);
  ctx.fillStyle = e.color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  for (let i = 0; i < e.count; i++) {
    const p = e.particles[i];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (0.5 + t), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const PICKUP_COLORS: Readonly<Record<PickupType, string>> = {
  shield: "#4fd8ff",
  rapid: "#ffd23f",
  homing: "#ff7ad9",
  missile: "#ff5c5c",
  nuke: "#ffd23f",
  gravity: "#4fa8ff",
  warp: "#8dff3a",
};
const PICKUP_LETTERS: Readonly<Record<PickupType, string>> = {
  shield: "S",
  rapid: "R",
  homing: "H",
  missile: "M",
  nuke: "N",
  gravity: "G",
  warp: "W",
};

export function drawPickup(ctx: Ctx, p: PickupLook, sprites: Sprites | null = null): void {
  const bob = Math.sin(p.age * 3) * 4;
  if (sprites?.items) {
    drawSprite(ctx, sprites.items, p.type, p.pos.x, p.pos.y + bob, 0, p.radius / 20);
    return;
  }
  ctx.save();
  ctx.translate(p.pos.x, p.pos.y + bob);
  ctx.fillStyle = PICKUP_COLORS[p.type];
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(PICKUP_LETTERS[p.type], 0, 1);
  ctx.restore();
}

export function drawPull(ctx: Ctx, p: Point, time: number): void {
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const phase = (((time / 900 + i / 3) % 1) + 1) % 1;
    const r = 260 * (1 - phase) + 40;
    ctx.globalAlpha = 0.5 * phase;
    ctx.strokeStyle = "#4fa8ff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export interface MissileLook {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly type: "homing" | "nuke";
}

export function drawMissile(
  ctx: Ctx,
  m: MissileLook,
  time: number,
  sprites: Sprites | null = null,
): void {
  if (m.type === "nuke") {
    const pulse = Math.floor(time / 150) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = pulse ? "#ff5c5c" : "#ffd23f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (sprites?.items) {
      drawSprite(ctx, sprites.items, "bomb", m.x, m.y, time / 300);
      return;
    }
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.arc(m.x, m.y, 16, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (sprites?.items && sprites.ships) {
    const back = -26;
    drawSprite(
      ctx,
      sprites.ships,
      "flame",
      m.x + Math.cos(m.angle) * back,
      m.y + Math.sin(m.angle) * back,
      m.angle,
      0.6,
    );
    drawSprite(ctx, sprites.items, "rocket", m.x, m.y, m.angle);
    return;
  }
  ctx.fillStyle = "#ff5c5c";
  ctx.beginPath();
  ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
  ctx.fill();
}

export function drawShield(
  ctx: Ctx,
  p: Point & { readonly angle?: number },
  sprites: Sprites | null = null,
): void {
  if (sprites?.ships) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    drawSprite(ctx, sprites.ships, "shield", p.x, p.y, (p.angle ?? 0) + Math.PI / 2, 1);
    ctx.restore();
    return;
  }
  ctx.strokeStyle = "rgba(79, 216, 255, 0.8)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 40, 0, Math.PI * 2);
  ctx.stroke();
}

function drawRange(ctx: Ctx, x: number, y: number, range: number, color: string): void {
  ctx.save();
  ctx.setLineDash([6, 14]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBlackHole(ctx: Ctx, w: WellLook, p: Pose, time: number): void {
  const warning = w.timeLeft < 3 && Math.floor(time / 120) % 2 === 0;
  drawRange(ctx, p.x, p.y, w.range, "rgba(141, 255, 58, 0.12)");
  drawRange(ctx, p.x, p.y, w.range * 0.45, "rgba(255, 122, 217, 0.18)");

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.strokeStyle = i % 2 ? "rgba(255, 122, 217, 0.75)" : "rgba(141, 255, 58, 0.75)";
    ctx.lineWidth = 7 - i;
    ctx.beginPath();
    ctx.arc(0, 0, w.radius * 2.1, 0, Math.PI * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, w.radius * 1.55, Math.PI, Math.PI * 1.7);
    ctx.stroke();
  }
  ctx.restore();

  const glow = ctx.createRadialGradient(p.x, p.y, w.radius * 0.6, p.x, p.y, w.radius * 1.6);
  glow.addColorStop(0, "#000000");
  glow.addColorStop(0.6, "#05010a");
  glow.addColorStop(1, warning ? "rgba(255, 92, 92, 0)" : "rgba(141, 255, 58, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, w.radius * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = warning ? "#ff5c5c" : GOO;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, w.radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPlanet(ctx: Ctx, w: WellLook, p: Pose): void {
  drawRange(ctx, p.x, p.y, w.range, "rgba(79, 216, 255, 0.14)");
  const r = w.radius;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;

  ctx.fillStyle = "#4fd8ff";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.rotate(p.angle);
  ctx.fillStyle = "#2fa8d8";
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.32, r * 0.18, 0.4, 0, Math.PI * 2);
  ctx.ellipse(r * 0.35, r * 0.3, r * 0.22, r * 0.14, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(-p.angle);

  ctx.fillStyle = "#fff";
  for (const ex of [-0.25, 0.25]) {
    ctx.beginPath();
    ctx.arc(ex * r, -0.05 * r, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(-0.22 * r, -0.03 * r, r * 0.07, 0, Math.PI * 2);
  ctx.arc(0.28 * r, -0.03 * r, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, r * 0.25, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.strokeStyle = "#ffd23f";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.6, r * 0.38, -0.35, 0.05 * Math.PI, 0.95 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

export function drawWell(
  ctx: Ctx,
  w: WellLook,
  p: Pose,
  time: number,
  sprites: Sprites | null = null,
): void {
  if (w.type === "blackhole") {
    drawBlackHole(ctx, w, p, time);
    return;
  }
  const sheet = sprites?.planets;
  if (sheet) {
    drawRange(ctx, p.x, p.y, w.range, "rgba(79, 216, 255, 0.14)");
    drawSprite(ctx, sheet, `planet${(w.id ?? 0) % 10}`, p.x, p.y, p.angle, (w.radius * 2.25) / 150);
    return;
  }
  drawPlanet(ctx, w, p);
}
