const AFFECTED = new Set(["ship", "bullet", "asteroid"]);

export function applyGravity(world, dt) {
  const wells = [...world.ofKind("well")];
  if (wells.length === 0) return;

  for (const entity of world) {
    if (!entity.alive || entity.dead || !AFFECTED.has(entity.kind)) continue;
    let ax = 0;
    let ay = 0;
    for (const well of wells) {
      const dx = well.pos.x - entity.pos.x;
      const dy = well.pos.y - entity.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > well.range * well.range) continue;
      const soft = well.radius * 1.5;
      const pull = well.strength / Math.max(d2, soft * soft);
      const d = Math.sqrt(d2) || 1;
      ax += (dx / d) * pull;
      ay += (dy / d) * pull;
    }
    if (ax !== 0 || ay !== 0) {
      entity.vel = entity.vel.add({ x: ax * dt, y: ay * dt });
    }
  }
}
