import { wrap } from "../sim/arena.js";

const GOO = "#8dff3a";
const INK = "#1a0b26";

function makeStars(width, height, count) {
  const stars = [];
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

let stars = null;

const DEFAULT_THEME = {
  background: ["#3d1b63", "#140a24"],
  planet: { x: 0.82, y: 0.2, r: 70, color: "#ff7ad9" },
};

export function drawBackground(ctx, arena, theme = DEFAULT_THEME) {
  const [inner, outer] = theme.background;
  const g = ctx.createRadialGradient(
    arena.width * 0.3,
    arena.height * 0.3,
    50,
    arena.width / 2,
    arena.height / 2,
    arena.width,
  );
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, arena.width, arena.height);

  stars ??= makeStars(arena.width, arena.height, 220);
  for (const s of stars) {
    ctx.globalAlpha = 0.4 + s.a * 0.6;
    ctx.fillStyle = s.a > 0.85 ? GOO : "#f4e9ff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const { x, y, r, color } = theme.planet;
  const px = arena.width * x;
  const py = arena.height * y;
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(26, 11, 38, 0.18)";
  ctx.beginPath();
  ctx.arc(px - r * 0.3, py + r * 0.2, r * 0.26, 0, Math.PI * 2);
  ctx.arc(px + r * 0.35, py - r * 0.3, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(141, 255, 58, 0.25)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, arena.width, arena.height);
}

export function drawSprite(ctx, sheet, frameName, x, y, angle = 0, scale = 1) {
  const [sx, sy, sw, sh] = sheet.frames[frameName];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.drawImage(sheet.image, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpWrapped(a, b, t, size) {
  let d = b - a;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return wrap(lerp(a, a + d, t), size);
}

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function interpolate(entity, alpha, arena) {
  return {
    x: lerpWrapped(entity.prevPos.x, entity.pos.x, alpha, arena.width),
    y: lerpWrapped(entity.prevPos.y, entity.pos.y, alpha, arena.height),
    angle: lerpAngle(entity.prevAngle, entity.angle, alpha),
  };
}

export function interpolateShip(ship, alpha, arena) {
  return { ...interpolate(ship, alpha, arena), thrust: ship.thrust };
}

function drawFlame(ctx, time) {
  const flicker = 10 + Math.sin(time * 0.05) * 6;
  ctx.fillStyle = "#ffd23f";
  ctx.strokeStyle = "#ff7a00";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, -6);
  ctx.lineTo(-30 - flicker, 0);
  ctx.lineTo(-14, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function drawShip(ctx, ship, time, own = true, sprites = null) {
  if (sprites?.ships) {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    ctx.scale(1.5, 1.5);
    if (ship.thrust) drawFlame(ctx, time);
    ctx.restore();
    drawSprite(ctx, sprites.ships, own ? "player" : "dummy", ship.x, ship.y, ship.angle);
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

export function drawHud(ctx, view, stats, extra = []) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  const lines = [
    `steps/s  ${stats.stepsPerSecond}`,
    `frames/s ${stats.framesPerSecond}`,
    `frame    ${stats.frameTime.toFixed(2)} ms`,
    ...extra.filter(Boolean),
  ];
  ctx.font = "14px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "rgba(20, 8, 36, 0.7)";
  ctx.fillRect(10, 10, 190, 20 + lines.length * 18);
  ctx.fillStyle = GOO;
  lines.forEach((line, i) => {
    ctx.fillText(line, 20, 32 + i * 18);
  });
}

export function drawBullet(ctx, b, sprites = null) {
  if (sprites?.items) {
    drawSprite(ctx, sprites.items, "bullet", b.x, b.y, b.angle, 0.8);
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

export function drawAsteroid(ctx, a, p, sprites = null) {
  if (sprites?.asteroids) {
    const frame = `${a.hunter ? "hunter" : "rock"}${a.id % 4}`;
    drawSprite(ctx, sprites.asteroids, frame, p.x, p.y, a.hunter ? 0 : p.angle, a.radius / 52);
    return;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = a.hunter ? "#9c5a7a" : "#7a6a8f";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  const n = a.shape.length;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const r = a.radius * a.shape[i];
    if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
    else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
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

export function drawExplosion(ctx, e) {
  const t = e.ttl / e.duration;
  ctx.globalAlpha = Math.max(0, t);
  ctx.fillStyle = e.color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  for (const p of e.particles) {
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.r * (0.5 + t), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const PICKUP_COLORS = { shield: "#4fd8ff", rapid: "#ffd23f", homing: "#ff7ad9" };
const PICKUP_LETTERS = { shield: "S", rapid: "R", homing: "H" };

export function drawPickup(ctx, p, sprites = null) {
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

export function drawShield(ctx, p) {
  ctx.strokeStyle = "rgba(79, 216, 255, 0.8)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 40, 0, Math.PI * 2);
  ctx.stroke();
}

function drawRange(ctx, x, y, range, color) {
  ctx.save();
  ctx.setLineDash([6, 14]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBlackHole(ctx, w, p, time) {
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

function drawPlanet(ctx, w, p) {
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

export function drawWell(ctx, w, p, time) {
  if (w.type === "blackhole") drawBlackHole(ctx, w, p, time);
  else drawPlanet(ctx, w, p);
}
