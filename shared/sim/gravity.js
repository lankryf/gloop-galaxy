const AFFECTED = new Set(["bullet", "asteroid"]);

export function gravityAt(x, y, wells) {
  let ax = 0;
  let ay = 0;
  for (const well of wells) {
    const dx = well.x - x;
    const dy = well.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > well.range * well.range) continue;
    const soft = well.radius * 1.5;
    const pull = well.strength / Math.max(d2, soft * soft);
    const d = Math.sqrt(d2) || 1;
    ax += (dx / d) * pull;
    ay += (dy / d) * pull;
  }
  return { ax, ay };
}

export function wellFields(world) {
  const fields = [];
  for (const well of world.ofKind("well")) fields.push(well.field);
  return fields;
}

export function applyGravity(world, dt) {
  const wells = wellFields(world);
  if (wells.length === 0) return;

  for (const entity of world) {
    if (!entity.alive || !AFFECTED.has(entity.kind)) continue;
    const { ax, ay } = gravityAt(entity.pos.x, entity.pos.y, wells);
    if (ax !== 0 || ay !== 0) {
      entity.vel = entity.vel.add({ x: ax * dt, y: ay * dt });
    }
  }
}
