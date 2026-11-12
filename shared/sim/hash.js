export function hashNumbers(numbers) {
  let h = 0x811c9dc5;
  const view = new DataView(new ArrayBuffer(8));
  for (const n of numbers) {
    view.setFloat64(0, n, true);
    for (let i = 0; i < 8; i++) {
      h ^= view.getUint8(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, "0");
}

export function hashWorld(world) {
  const numbers = [];
  for (const e of world) {
    numbers.push(e.id, e.pos.x, e.pos.y, e.vel.x, e.vel.y, e.angle, e.alive ? 1 : 0);
  }
  return hashNumbers(numbers);
}
