export function findCollisions(entities) {
  const list = [];
  for (const e of entities) {
    if (e.alive && e.collidable) list.push(e);
  }
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      const r = a.radius + b.radius;
      if (dx * dx + dy * dy < r * r) pairs.push([a, b]);
    }
  }
  return pairs;
}
