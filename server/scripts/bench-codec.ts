import * as binary from "@gloop/shared/codec/binary.ts";
import * as json from "@gloop/shared/codec/json.ts";
import { entityId, seq, tick } from "@gloop/shared/ids.ts";
import type { EntitySnap, Snapshot } from "@gloop/shared/protocol.ts";
import { parseServerMessage } from "@gloop/shared/protocol.ts";

function sampleSnapshot(ships = 5, bullets = 12, asteroids = 6): Snapshot {
  const entities: EntitySnap[] = [];
  let id = 1;
  for (let i = 0; i < ships; i++) {
    entities.push({
      kind: "ship",
      id: entityId(id++),
      x: 100 + i * 37.25,
      y: 450.5,
      vx: 120.5,
      vy: -33.25,
      angle: 1.2345,
      hp: 100,
      flags: 1,
      score: 230,
      respawn: 0,
      ability: null,
      charge: 0,
      heat: 0,
      cooling: false,
      stealth: false,
    });
  }
  for (let i = 0; i < bullets; i++) {
    entities.push({
      kind: "bullet",
      id: entityId(id++),
      x: 300.125 + i,
      y: 200.5,
      vx: 700.25,
      vy: 10.5,
      owner: entityId(1),
      shot: seq(1000 + i),
    });
  }
  for (let i = 0; i < asteroids; i++) {
    entities.push({
      kind: "asteroid",
      id: entityId(id++),
      x: 800.5 + i * 10,
      y: 300.25,
      angle: 0.5 * i,
      radius: 40,
      hunter: i === 0,
      forming: 0,
    });
  }
  entities.push({ kind: "pickup", id: entityId(id++), x: 500, y: 500, type: "rapid" });
  entities.push({
    kind: "well",
    id: entityId(id++),
    x: 1056.5,
    y: 558.25,
    vx: -14,
    vy: 9,
    angle: 2.5,
    type: "blackhole",
    mass: 250,
    radius: 40,
  });
  return {
    tick: tick(12345),
    ack: seq(678),
    entities,
    events: [{ type: "fired", x: 10, y: 20, shipId: entityId(1) }],
  };
}

function bench<T extends string | ArrayBuffer>(
  name: string,
  encode: (s: Snapshot) => T,
  decode: (data: T) => unknown,
  snapshot: Snapshot,
  rounds = 20000,
): void {
  for (let i = 0; i < 2000; i++) decode(encode(snapshot));
  const start = process.hrtime.bigint();
  let size = 0;
  for (let i = 0; i < rounds; i++) {
    const data = encode(snapshot);
    size = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
    decode(data);
  }
  const micros = Number(process.hrtime.bigint() - start) / 1000 / rounds;
  console.log(
    `${name.padEnd(12)} ${String(size).padStart(5)} B  ${micros.toFixed(2)} µs encode+decode`,
  );
}

const snapshot = sampleSnapshot();
console.log(`${snapshot.entities.length} entities`);
bench("json", json.encodeSnapshot, (s: string) => JSON.parse(s), snapshot);
bench("json + zod", json.encodeSnapshot, parseServerMessage, snapshot);
bench("binary", binary.encodeSnapshot, binary.decodeSnapshot, snapshot);
