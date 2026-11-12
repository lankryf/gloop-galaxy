import { Vector2 } from "./vector.js";

export function homing({ targetKind, turnRate = 2.5, range = 450, ignoreId = null }) {
  return function steer(entity, world, dt) {
    let target = null;
    let best = range;
    for (const candidate of world.ofKind(targetKind)) {
      if (candidate.id === ignoreId || candidate.dead) continue;
      const d = candidate.pos.sub(entity.pos).length();
      if (d < best) {
        best = d;
        target = candidate;
      }
    }
    if (!target) return;

    const speed = entity.vel.length();
    const current = entity.vel.angle();
    const wanted = target.pos.sub(entity.pos).angle();
    let diff = wanted - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
    entity.vel = Vector2.fromAngle(current + turn, speed);
    if (entity.kind === "bullet") entity.angle = entity.vel.angle();
  };
}
