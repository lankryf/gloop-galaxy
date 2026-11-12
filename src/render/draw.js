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

export function drawBackground(ctx, arena) {
  const g = ctx.createRadialGradient(
    arena.width * 0.3,
    arena.height * 0.3,
    50,
    arena.width / 2,
    arena.height / 2,
    arena.width,
  );
  g.addColorStop(0, "#3d1b63");
  g.addColorStop(1, "#140a24");
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

  ctx.fillStyle = "#ff7ad9";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(arena.width * 0.82, arena.height * 0.2, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#d94fb6";
  ctx.beginPath();
  ctx.arc(arena.width * 0.8, arena.height * 0.22, 18, 0, Math.PI * 2);
  ctx.arc(arena.width * 0.85, arena.height * 0.16, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(141, 255, 58, 0.25)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, arena.width, arena.height);
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

export function interpolateShip(prev, curr, alpha, arena) {
  return {
    x: lerpWrapped(prev.x, curr.x, alpha, arena.width),
    y: lerpWrapped(prev.y, curr.y, alpha, arena.height),
    angle: lerpAngle(prev.angle, curr.angle, alpha),
    thrust: curr.thrust,
  };
}

export function drawShip(ctx, ship, time) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

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

  ctx.fillStyle = "#b7b9c9";
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
    ...extra,
  ];
  ctx.font = "14px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "rgba(20, 8, 36, 0.7)";
  ctx.fillRect(10, 10, 190, 20 + lines.length * 18);
  ctx.fillStyle = GOO;
  lines.forEach((line, i) => {
    ctx.fillText(line, 20, 32 + i * 18);
  });
}
