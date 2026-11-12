import assert from "node:assert/strict";
import { test } from "node:test";
import * as binary from "../codec/binary.ts";
import { entityId, seq, tick } from "../ids.ts";
import type { Snapshot } from "../protocol.ts";
import { parseClientMessage, SnapshotSchema } from "../protocol.ts";

const snapshot: Snapshot = {
  tick: tick(123456),
  ack: seq(987),
  entities: [
    {
      kind: "ship",
      id: entityId(1),
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
    {
      kind: "bullet",
      id: entityId(70),
      x: 10.5,
      y: 899.75,
      vx: 700,
      vy: -12.5,
      owner: entityId(1),
      shot: seq(4000000),
    },
    {
      kind: "asteroid",
      id: entityId(65535),
      x: 1599.5,
      y: 0,
      angle: 3.125,
      radius: 54,
      hunter: true,
    },
    { kind: "pickup", id: entityId(4), x: 400, y: 300, type: "homing" },
    {
      kind: "well",
      id: entityId(5),
      x: 1056,
      y: 558,
      vx: -14,
      vy: 9,
      angle: 1.25,
      type: "blackhole",
      timeLeft: 297,
    },
  ],
  events: [
    { type: "scored", x: 100.5, y: 200.25, shipId: entityId(1), points: 100 },
    { type: "hit", x: 1, y: 2, target: "asteroid", shipId: null },
    { type: "swallowed", x: 3, y: 4, what: "ship", shipId: entityId(1) },
    { type: "pickup", x: 5, y: 6, shipId: entityId(1), pickup: "rapid" },
  ],
};

test("binary snapshot survives a round trip", () => {
  assert.deepEqual(binary.decodeSnapshot(binary.encodeSnapshot(snapshot)), snapshot);
});

test("ack can be patched into an encoded snapshot", () => {
  const buffer = binary.encodeSnapshot({ ...snapshot, ack: seq(0) });
  binary.setAck(buffer, seq(42));
  assert.equal(binary.decodeSnapshot(buffer).ack, 42);
});

test("angles are quantized to 1/10000 rad", () => {
  const ship = snapshot.entities[0];
  assert.ok(ship?.kind === "ship");
  const encoded = binary.encodeSnapshot({
    tick: tick(1),
    ack: seq(0),
    entities: [{ ...ship, angle: 1.234567 }],
    events: [],
  });
  const decoded = binary.decodeSnapshot(encoded).entities[0];
  assert.ok(decoded && decoded.kind === "ship");
  assert.ok(Math.abs(decoded.angle - 1.234567) <= 0.00005);
});

test("input round trip and validation", () => {
  const inputs = [
    { seq: seq(1), buttons: 0b1001 },
    { seq: seq(2), buttons: 0 },
  ];
  assert.deepEqual(binary.decodeInput(binary.encodeInput(inputs)), inputs);
  assert.equal(new Uint8Array(binary.encodeInput(inputs))[0], binary.MessageType.input);
  assert.throws(() => binary.decodeInput(new Uint8Array([1, 1, 5, 0])), binary.CodecError);
  assert.throws(() => binary.decodeInput(new Uint8Array([1, 9, 1, 0, 0, 0, 0, 0])), /version/);
  assert.throws(() => binary.decodeInput(new Uint8Array([1, 1, 1, 0, 0, 0, 0, 99])), /buttons/);
});

test("truncated or garbage snapshots throw instead of returning junk", () => {
  const full = new Uint8Array(binary.encodeSnapshot(snapshot));
  for (const cut of [0, 1, 5, 12, 30, full.length - 1]) {
    assert.throws(() => binary.decodeSnapshot(full.slice(0, cut)), binary.CodecError);
  }
  assert.throws(() =>
    binary.decodeSnapshot(new Uint8Array([2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 99])),
  );
});

test("json snapshot matches the schema", () => {
  const parsed = SnapshotSchema.safeParse(JSON.parse(JSON.stringify(snapshot)));
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data, snapshot);
});

test("client messages are validated by the schema", () => {
  assert.equal(parseClientMessage('{"v":0,"type":"join","room":"room-1","name":"Olek"}').ok, true);
  const bad = [
    "{oops",
    "[1,2]",
    '{"v":1,"type":"chat","text":"hi"}',
    '{"v":0,"type":"teleport"}',
    '{"v":0,"type":"constructor"}',
    '{"v":0,"type":"__proto__"}',
    '{"v":0,"type":"chat","text":""}',
    '{"v":0,"type":"join","room":"r","name":"<script>"}',
    '{"v":0,"type":"input","inputs":[{"seq":-1,"buttons":0}]}',
    '{"v":0,"type":"input","inputs":[{"seq":1,"buttons":99}]}',
  ];
  for (const text of bad) assert.equal(parseClientMessage(text).ok, false, text);
  const big = JSON.stringify({ v: 0, type: "chat", text: "x".repeat(3000) });
  const result = parseClientMessage(big);
  assert.ok(!result.ok && result.error === "message too large");
});
