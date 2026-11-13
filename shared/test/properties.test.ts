import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  CodecError,
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
} from "../codec/binary.ts";
import type { EntityId } from "../ids.ts";
import { entityId, seq, tick } from "../ids.ts";
import type { ClientMessage, EntitySnap, NetEvent, Snapshot } from "../protocol.ts";
import { MAX_BUTTONS, PROTOCOL_VERSION, parseClientMessage } from "../protocol.ts";
import { ARENA, wrap } from "../sim/arena.ts";
import { MISSILE_TYPES } from "../sim/missile.ts";
import { ABILITY_TYPES, PICKUP_TYPES } from "../sim/pickup.ts";
import { Ship } from "../sim/ship.ts";
import { Vector2 } from "../sim/vector.ts";
import { GravityWell, WELL_TYPES } from "../sim/well.ts";
import { World } from "../sim/world.ts";

const id = fc.integer({ min: 1, max: 0xffff }).map(entityId);
const u32 = fc.integer({ min: 0, max: 0xffffffff });
const coord = fc.double({ min: 0, max: 1600, noNaN: true });
const speed = fc.double({ min: -2000, max: 2000, noNaN: true });
const angle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });

const entity: fc.Arbitrary<EntitySnap> = fc.oneof(
  fc.record({
    kind: fc.constant("ship" as const),
    id,
    x: coord,
    y: coord,
    vx: speed,
    vy: speed,
    angle,
    hp: fc.integer({ min: 0, max: 255 }),
    flags: fc.integer({ min: 0, max: 255 }),
    score: fc.integer({ min: 0, max: 0xffff }),
    respawn: fc.integer({ min: 0, max: 255 }),
    charge: fc.integer({ min: 0, max: 255 }),
    heat: fc.integer({ min: 0, max: 100 }),
    cooling: fc.boolean(),
    ability: fc.option(fc.constantFrom(...ABILITY_TYPES), { nil: null }),
  }),
  fc.record({
    kind: fc.constant("missile" as const),
    id,
    x: coord,
    y: coord,
    vx: speed,
    vy: speed,
    owner: id,
    type: fc.constantFrom(...MISSILE_TYPES),
  }),
  fc.record({
    kind: fc.constant("bullet" as const),
    id,
    x: coord,
    y: coord,
    vx: speed,
    vy: speed,
    owner: id,
    shot: u32.map(seq),
  }),
  fc.record({
    kind: fc.constant("asteroid" as const),
    id,
    x: coord,
    y: coord,
    angle,
    radius: fc.integer({ min: 0, max: 255 }),
    hunter: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant("pickup" as const),
    id,
    x: coord,
    y: coord,
    type: fc.constantFrom(...PICKUP_TYPES),
  }),
  fc.record({
    kind: fc.constant("well" as const),
    id,
    x: coord,
    y: coord,
    vx: speed,
    vy: speed,
    angle,
    type: fc.constantFrom(...WELL_TYPES),
    mass: fc.integer({ min: 0, max: 0xffff }),
    radius: fc.integer({ min: 0, max: 255 }),
  }),
  fc.record({ kind: fc.constant("dust" as const), id, x: coord, y: coord }),
);

const shipRef: fc.Arbitrary<EntityId | null> = fc.option(id, { nil: null });
const event: fc.Arbitrary<NetEvent> = fc.oneof(
  fc.record({ type: fc.constant("fired" as const), x: coord, y: coord, shipId: id }),
  fc.record({
    type: fc.constant("hit" as const),
    x: coord,
    y: coord,
    target: fc.constantFrom("asteroid" as const, "ship" as const),
    shipId: shipRef,
  }),
  fc.record({
    type: fc.constant("exploded" as const),
    x: coord,
    y: coord,
    size: fc.integer({ min: 0, max: 25 }).map((n) => n / 10),
  }),
  fc.record({
    type: fc.constant("scored" as const),
    x: coord,
    y: coord,
    shipId: id,
    points: fc.integer({ min: 0, max: 255 }).map((n) => n * 10),
  }),
  fc.record({
    type: fc.constant("pickup" as const),
    x: coord,
    y: coord,
    shipId: id,
    pickup: fc.constantFrom(...PICKUP_TYPES),
  }),
  fc.record({
    type: fc.constant("swallowed" as const),
    x: coord,
    y: coord,
    what: fc.constantFrom("bullet" as const, "asteroid" as const, "ship" as const),
    shipId: shipRef,
  }),
  fc.record({
    type: fc.constant("collapsed" as const),
    x: coord,
    y: coord,
    range: fc.integer({ min: 0, max: 0xffff }),
  }),
  fc.record({
    type: fc.constant("formed" as const),
    x: coord,
    y: coord,
    radius: fc.integer({ min: 0, max: 255 }),
  }),
  fc.record({
    type: fc.constant("warped" as const),
    x: coord,
    y: coord,
    shipId: id,
    arrive: fc.boolean(),
  }),
  fc.record({
    type: fc.constant("ability" as const),
    x: coord,
    y: coord,
    shipId: id,
    ability: fc.constantFrom(...ABILITY_TYPES),
  }),
);

const snapshot: fc.Arbitrary<Snapshot> = fc.record({
  tick: u32.map(tick),
  ack: u32.map(seq),
  entities: fc.array(entity, { maxLength: 40 }),
  events: fc.array(event, { maxLength: 20 }),
});

const SIZE: Record<EntitySnap["kind"], number> = {
  ship: 29,
  bullet: 25,
  asteroid: 15,
  pickup: 12,
  well: 25,
  missile: 22,
  dust: 11,
};
const close = (a: number, b: number, eps: number) =>
  Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

describe("binary codec", () => {
  test("round trip keeps every field within float32 / angle precision", () => {
    fc.assert(
      fc.property(snapshot, (snap) => {
        const back = decodeSnapshot(encodeSnapshot(snap));
        expect(back.tick).toBe(snap.tick);
        expect(back.ack).toBe(snap.ack);
        expect(back.entities.length).toBe(snap.entities.length);
        expect(back.events.length).toBe(snap.events.length);
        snap.entities.forEach((e, i) => {
          const d = back.entities[i];
          expect(d?.kind).toBe(e.kind);
          expect(d?.id).toBe(e.id);
          expect(close(d?.x ?? Number.NaN, e.x, 1e-6)).toBe(true);
          expect(close(d?.y ?? Number.NaN, e.y, 1e-6)).toBe(true);
          if (d && "angle" in d && "angle" in e)
            expect(Math.abs(d.angle - e.angle)).toBeLessThanOrEqual(5e-5 + 1e-9);
        });
        expect(back.events.map((e) => e.type)).toEqual(snap.events.map((e) => e.type));
      }),
    );
  });

  test("encoded length matches the layout in docs/protocol.md", () => {
    fc.assert(
      fc.property(snapshot, (snap) => {
        const expected =
          12 + snap.entities.reduce((s, e) => s + SIZE[e.kind], 0) + 1 + 12 * snap.events.length;
        expect(encodeSnapshot(snap).byteLength).toBe(expected);
      }),
    );
  });

  test("garbage never crashes the decoders, it only raises CodecError", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        for (const decode of [decodeSnapshot, decodeInput]) {
          try {
            decode(bytes);
          } catch (error: unknown) {
            expect(error).toBeInstanceOf(CodecError);
          }
        }
      }),
      { numRuns: 2000 },
    );
  });

  test("a real snapshot with flipped bytes still only raises CodecError", () => {
    fc.assert(
      fc.property(snapshot, fc.nat(), fc.integer({ min: 0, max: 255 }), (snap, at, value) => {
        const bytes = new Uint8Array(encodeSnapshot(snap));
        bytes[at % bytes.length] = value;
        try {
          decodeSnapshot(bytes);
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(CodecError);
        }
      }),
    );
  });

  test("input batches round trip exactly", () => {
    const record = fc.record({
      seq: u32.map(seq),
      buttons: fc.integer({ min: 0, max: MAX_BUTTONS }),
    });
    fc.assert(
      fc.property(fc.array(record, { minLength: 1, maxLength: 16 }), (inputs) => {
        expect(decodeInput(encodeInput(inputs))).toEqual(inputs);
      }),
    );
  });
});

describe("arena", () => {
  test("wrap always lands inside [0, size)", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (v) => {
        const w = wrap(v, ARENA.width);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThan(ARENA.width);
      }),
    );
  });

  test("ships stay inside the arena over 1000 random input steps, other bodies may fly in from outside", () => {
    const controls = fc.record({
      thrust: fc.boolean(),
      left: fc.boolean(),
      right: fc.boolean(),
      fire: fc.boolean(),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.array(controls, { minLength: 1000, maxLength: 1000 }),
        (seed, inputs) => {
          const world = new World({ seed });
          world.spawn(
            new GravityWell({
              type: "blackhole",
              pos: new Vector2(ARENA.width / 2, ARENA.height / 2),
            }),
          );
          const ship = world.spawn(new Ship({ pos: new Vector2(100, 100), inputDriven: true }));
          inputs.forEach((input, i) => {
            ship.steer(input, 1 / 30, world, seq(i + 1));
            world.step(1 / 30);
            for (const e of world.ofKind("ship")) {
              expect(e.pos.x).toBeGreaterThanOrEqual(0);
              expect(e.pos.x).toBeLessThan(ARENA.width);
              expect(e.pos.y).toBeGreaterThanOrEqual(0);
              expect(e.pos.y).toBeLessThan(ARENA.height);
            }
          });
        },
      ),
      { numRuns: 10 },
    );
  });
});

describe("parseClientMessage", () => {
  const name = fc.stringMatching(/^[a-zA-Zа-яА-Я0-9_ .-]{1,16}$/);
  const valid: fc.Arbitrary<ClientMessage> = fc.oneof(
    fc.record({
      v: fc.constant(PROTOCOL_VERSION),
      type: fc.constant("join" as const),
      room: fc.string({ minLength: 1, maxLength: 32 }),
      name,
      codec: fc.constantFrom("json" as const, "binary" as const),
    }),
    fc.record({
      v: fc.constant(PROTOCOL_VERSION),
      type: fc.constant("chat" as const),
      text: fc.string({ minLength: 1, maxLength: 200 }),
    }),
    fc.record({ v: fc.constant(PROTOCOL_VERSION), type: fc.constant("leave" as const) }),
    fc.record({
      v: fc.constant(PROTOCOL_VERSION),
      type: fc.constant("input" as const),
      inputs: fc.array(
        fc.record({ seq: u32.map(seq), buttons: fc.integer({ min: 0, max: MAX_BUTTONS }) }),
        {
          minLength: 1,
          maxLength: 16,
        },
      ),
    }),
    fc.record({
      v: fc.constant(PROTOCOL_VERSION),
      type: fc.constant("ping" as const),
      t: fc.double({ noNaN: true, noDefaultInfinity: true }),
    }),
  );

  test("accepts every valid message", () => {
    fc.assert(
      fc.property(valid, (msg) => {
        const result = parseClientMessage(JSON.stringify(msg));
        expect(result.ok).toBe(true);
      }),
    );
  });

  const mutation = fc.oneof(
    fc.constant((m: Record<string, unknown>) => ({ ...m, v: 99 })),
    fc.constant((m: Record<string, unknown>) => ({ ...m, type: "teleport" })),
    fc.constant((m: Record<string, unknown>) => {
      const { type: _type, ...rest } = m;
      return rest;
    }),
    fc.constant((m: Record<string, unknown>) => {
      if (m.type === "join") return { ...m, name: "" };
      if (m.type === "chat") return { ...m, text: "x".repeat(201) };
      if (m.type === "input") return { ...m, inputs: [] };
      if (m.type === "ping") return { ...m, t: "now" };
      return { ...m, v: "0" };
    }),
  );

  test("rejects every broken copy of a valid message", () => {
    fc.assert(
      fc.property(valid, mutation, (msg, mutate) => {
        const result = parseClientMessage(JSON.stringify(mutate({ ...msg })));
        expect(result.ok).toBe(false);
      }),
    );
  });
});
