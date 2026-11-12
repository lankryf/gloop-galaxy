import assert from "node:assert/strict";
import { test } from "node:test";
import * as binary from "../codec/binary.js";
import * as json from "../codec/json.js";
import { EventType, Kind, MessageType } from "../protocol.js";

const snapshot = {
  tick: 123456,
  ack: 987,
  entities: [
    {
      id: 1,
      kind: Kind.ship,
      x: 812.25,
      y: 33.5,
      vx: -120.5,
      vy: 8.125,
      angle: -2.5,
      hp: 75,
      flags: 5,
      score: 1230,
      respawn: 0,
    },
    { id: 70, kind: Kind.bullet, x: 10.5, y: 899.75, vx: 700, vy: -12.5, owner: 1, shot: 4000000 },
    { id: 65535, kind: Kind.asteroid, x: 1599.5, y: 0, angle: 3.125, radius: 54, hunter: true },
    { id: 4, kind: Kind.pickup, x: 400, y: 300, type: 2 },
    {
      id: 5,
      kind: Kind.well,
      x: 1056,
      y: 558,
      vx: -14,
      vy: 9,
      angle: 1.25,
      type: 0,
      timeLeft: 297,
    },
  ],
  events: [{ type: EventType.scored, x: 100.5, y: 200.25, a: 100, b: 0 }],
};

test("binary snapshot survives a round trip", () => {
  const decoded = binary.decodeSnapshot(binary.encodeSnapshot(snapshot));
  assert.deepEqual(decoded, snapshot);
});

test("ack can be patched into an encoded snapshot", () => {
  const buffer = binary.encodeSnapshot({ ...snapshot, ack: 0 });
  binary.setAck(buffer, 42);
  assert.equal(binary.decodeSnapshot(buffer).ack, 42);
});

test("angles are quantized to 1/10000 rad", () => {
  const ship = { ...snapshot.entities[0], angle: 1.234567 };
  const [decoded] = binary.decodeSnapshot(
    binary.encodeSnapshot({ tick: 1, entities: [ship] }),
  ).entities;
  assert.ok(Math.abs(decoded.angle - 1.234567) <= 0.00005);
});

test("input round trip and validation", () => {
  const inputs = [
    { seq: 1, buttons: 0b1001 },
    { seq: 2, buttons: 0 },
  ];
  assert.deepEqual(binary.decodeInput(binary.encodeInput(inputs)), inputs);
  assert.equal(new Uint8Array(binary.encodeInput(inputs))[0], MessageType.input);
  assert.throws(() => binary.decodeInput(new Uint8Array([1, 1, 5, 0])), binary.CodecError);
  assert.throws(() => binary.decodeInput(new Uint8Array([1, 9, 1, 0, 0, 0, 0, 0])), /version/);
});

test("truncated or garbage snapshots throw instead of returning junk", () => {
  const full = new Uint8Array(binary.encodeSnapshot(snapshot));
  for (const cut of [0, 1, 5, 12, 30, full.length - 1]) {
    assert.throws(() => binary.decodeSnapshot(full.slice(0, cut)), binary.CodecError);
  }
  assert.throws(() =>
    binary.decodeSnapshot(new Uint8Array([2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 99])),
  );
});

test("json codec carries the same data", () => {
  const msg = JSON.parse(json.encodeSnapshot(snapshot));
  assert.deepEqual(json.decodeSnapshot(msg), snapshot);
  assert.deepEqual(json.decodeInput(JSON.parse(json.encodeInput([{ seq: 3, buttons: 1 }]))), [
    { seq: 3, buttons: 1 },
  ]);
});
