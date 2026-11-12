import * as binary from "@gloop/shared/codec/binary.js";
import * as json from "@gloop/shared/codec/json.js";
import { Kind } from "@gloop/shared/protocol.js";

function sampleSnapshot(ships = 5, bullets = 12, asteroids = 6) {
  const entities = [];
  let id = 1;
  for (let i = 0; i < ships; i++) {
    entities.push({ id: id++, kind: Kind.ship, x: 100 + i * 37.25, y: 450.5, vx: 120.5, vy: -33.25, angle: 1.2345, hp: 100, flags: 1, score: 230, respawn: 0 });
  }
  for (let i = 0; i < bullets; i++) {
    entities.push({ id: id++, kind: Kind.bullet, x: 300.125 + i, y: 200.5, vx: 700.25, vy: 10.5, owner: 1, shot: 1000 + i });
  }
  for (let i = 0; i < asteroids; i++) {
    entities.push({ id: id++, kind: Kind.asteroid, x: 800.5 + i * 10, y: 300.25, angle: 0.5 * i, radius: 40, hunter: i === 0 });
  }
  entities.push({ id: id++, kind: Kind.pickup, x: 500, y: 500, type: 1 });
  entities.push({ id: id++, kind: Kind.well, x: 1056.5, y: 558.25, vx: -14, vy: 9, angle: 2.5, type: 0, timeLeft: 250 });
  return { tick: 12345, ack: 678, entities, events: [{ type: 1, x: 10, y: 20, a: 1, b: 0 }] };
}

function bench(name, encode, decode, snapshot, rounds = 20000) {
  for (let i = 0; i < 2000; i++) decode(encode(snapshot));
  const start = process.hrtime.bigint();
  let size = 0;
  for (let i = 0; i < rounds; i++) {
    const data = encode(snapshot);
    size = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
    decode(data);
  }
  const micros = Number(process.hrtime.bigint() - start) / 1000 / rounds;
  console.log(`${name.padEnd(7)} ${String(size).padStart(5)} B  ${micros.toFixed(2)} µs encode+decode`);
}

const snapshot = sampleSnapshot();
console.log(`${snapshot.entities.length} entities`);
bench("json", json.encodeSnapshot, (s) => json.decodeSnapshot(JSON.parse(s)), snapshot);
bench("binary", binary.encodeSnapshot, binary.decodeSnapshot, snapshot);
