import type { EntityId, Seq, Tick } from "../ids.ts";
import { isEntityId, isSeq, isTick } from "../ids.ts";
import type { EntitySnap, InputRecord, NetEvent, Snapshot } from "../protocol.ts";
import { assertNever, BINARY_VERSION, MAX_BUTTONS } from "../protocol.ts";
import type { MissileType } from "../sim/missile.ts";
import { MISSILE_TYPES } from "../sim/missile.ts";
import type { AbilityType, PickupType } from "../sim/pickup.ts";
import { ABILITY_TYPES, PICKUP_TYPES } from "../sim/pickup.ts";
import type { WellType } from "../sim/well.ts";
import { WELL_TYPES } from "../sim/well.ts";

export const MessageType = { input: 1, snapshot: 2 };

const KIND_CODE: Readonly<Record<EntitySnap["kind"], number>> = {
  ship: 1,
  bullet: 2,
  asteroid: 3,
  pickup: 4,
  well: 5,
  missile: 6,
};
const EVENT_CODE: Readonly<Record<NetEvent["type"], number>> = {
  fired: 1,
  hit: 2,
  exploded: 3,
  scored: 4,
  pickup: 5,
  swallowed: 6,
  collapsed: 7,
  ability: 8,
  warped: 9,
};
const SWALLOWED: readonly ["bullet", "asteroid", "ship"] = ["bullet", "asteroid", "ship"];
const ANGLE_SCALE = 10000;
const HEADER = 12;
const COMMON = 11;
const EVENT_SIZE = 12;
const SIZE: Readonly<Record<EntitySnap["kind"], number>> = {
  ship: COMMON + 17,
  bullet: COMMON + 14,
  asteroid: COMMON + 4,
  pickup: COMMON + 1,
  well: COMMON + 13,
  missile: COMMON + 11,
};
export const ACK_OFFSET = 6;

export class CodecError extends Error {
  override name = "CodecError";
}

type Bytes = ArrayBuffer | Uint8Array;

function toView(data: Bytes): DataView {
  if (data instanceof ArrayBuffer) return new DataView(data);
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function header(view: DataView, type: number): void {
  if (view.byteLength < 2) throw new CodecError("message too short");
  if (view.getUint8(0) !== type) throw new CodecError(`expected message type ${type}`);
  if (view.getUint8(1) !== BINARY_VERSION)
    throw new CodecError(`unsupported version ${view.getUint8(1)}`);
}

function angleToInt(angle: number): number {
  return Math.max(-32767, Math.min(32767, Math.round(angle * ANGLE_SCALE)));
}

function readId(view: DataView, offset: number): EntityId {
  const id = view.getUint16(offset, true);
  if (!isEntityId(id)) throw new CodecError(`bad entity id ${id}`);
  return id;
}

function readOptionalId(view: DataView, offset: number): EntityId | null {
  const id = view.getUint16(offset, true);
  return isEntityId(id) ? id : null;
}

function readSeq(view: DataView, offset: number): Seq {
  const value = view.getUint32(offset, true);
  if (!isSeq(value)) throw new CodecError(`bad seq ${value}`);
  return value;
}

function readTick(view: DataView, offset: number): Tick {
  const value = view.getUint32(offset, true);
  if (!isTick(value)) throw new CodecError(`bad tick ${value}`);
  return value;
}

function pickupAt(index: number): PickupType {
  const type = PICKUP_TYPES[index];
  if (type === undefined) throw new CodecError(`bad pickup type ${index}`);
  return type;
}

function abilityAt(index: number): AbilityType {
  const type = ABILITY_TYPES[index];
  if (type === undefined) throw new CodecError(`bad ability ${index}`);
  return type;
}

function abilityOrNull(code: number): AbilityType | null {
  return code === 0 ? null : abilityAt(code - 1);
}

function missileAt(index: number): MissileType {
  const type = MISSILE_TYPES[index];
  if (type === undefined) throw new CodecError(`bad missile type ${index}`);
  return type;
}

function wellAt(index: number): WellType {
  const type = WELL_TYPES[index];
  if (type === undefined) throw new CodecError(`bad well type ${index}`);
  return type;
}

function swallowedAt(index: number): (typeof SWALLOWED)[number] {
  const what = SWALLOWED[index];
  if (what === undefined) throw new CodecError(`bad swallowed kind ${index}`);
  return what;
}

export function messageType(data: Bytes): number {
  const view = toView(data);
  return view.byteLength > 0 ? view.getUint8(0) : -1;
}

export function encodeInput(inputs: readonly InputRecord[]): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(3 + inputs.length * 5));
  view.setUint8(0, MessageType.input);
  view.setUint8(1, BINARY_VERSION);
  view.setUint8(2, inputs.length);
  inputs.forEach(({ seq, buttons }, i) => {
    view.setUint32(3 + i * 5, seq, true);
    view.setUint8(7 + i * 5, buttons);
  });
  return view.buffer;
}

export function decodeInput(data: Bytes): InputRecord[] {
  const view = toView(data);
  header(view, MessageType.input);
  if (view.byteLength < 3) throw new CodecError("input too short");
  const count = view.getUint8(2);
  if (count === 0 || count > 16) throw new CodecError(`bad input count ${count}`);
  if (view.byteLength !== 3 + count * 5) throw new CodecError("input length mismatch");
  const inputs: InputRecord[] = [];
  for (let i = 0, o = 3; i < count; i++, o += 5) {
    const buttons = view.getUint8(o + 4);
    if (buttons > MAX_BUTTONS) throw new CodecError(`bad buttons ${buttons}`);
    inputs.push({ seq: readSeq(view, o), buttons });
  }
  return inputs;
}

function writeEntity(view: DataView, o: number, e: EntitySnap): number {
  view.setUint16(o, e.id, true);
  view.setUint8(o + 2, KIND_CODE[e.kind]);
  view.setFloat32(o + 3, e.x, true);
  view.setFloat32(o + 7, e.y, true);
  const p = o + COMMON;
  switch (e.kind) {
    case "ship":
      view.setFloat32(p, e.vx, true);
      view.setFloat32(p + 4, e.vy, true);
      view.setInt16(p + 8, angleToInt(e.angle), true);
      view.setUint8(p + 10, e.hp);
      view.setUint8(p + 11, e.flags);
      view.setUint16(p + 12, e.score, true);
      view.setUint8(p + 14, e.respawn);
      view.setUint8(p + 15, e.ability === null ? 0 : ABILITY_TYPES.indexOf(e.ability) + 1);
      view.setUint8(p + 16, e.charge);
      break;
    case "missile":
      view.setFloat32(p, e.vx, true);
      view.setFloat32(p + 4, e.vy, true);
      view.setUint16(p + 8, e.owner, true);
      view.setUint8(p + 10, MISSILE_TYPES.indexOf(e.type));
      break;
    case "bullet":
      view.setFloat32(p, e.vx, true);
      view.setFloat32(p + 4, e.vy, true);
      view.setUint16(p + 8, e.owner, true);
      view.setUint32(p + 10, e.shot, true);
      break;
    case "asteroid":
      view.setInt16(p, angleToInt(e.angle), true);
      view.setUint8(p + 2, e.radius);
      view.setUint8(p + 3, e.hunter ? 1 : 0);
      break;
    case "pickup":
      view.setUint8(p, PICKUP_TYPES.indexOf(e.type));
      break;
    case "well":
      view.setFloat32(p, e.vx, true);
      view.setFloat32(p + 4, e.vy, true);
      view.setInt16(p + 8, angleToInt(e.angle), true);
      view.setUint8(p + 10, WELL_TYPES.indexOf(e.type));
      view.setUint16(p + 11, e.mass, true);
      break;
    default:
      return assertNever(e);
  }
  return o + SIZE[e.kind];
}

function eventFields(ev: NetEvent): [number, number] {
  switch (ev.type) {
    case "fired":
      return [ev.shipId, 0];
    case "hit":
      return [ev.shipId ?? 0, ev.target === "ship" ? 1 : 0];
    case "exploded":
      return [0, Math.min(255, Math.round(ev.size * 10))];
    case "scored":
      return [ev.shipId, Math.min(255, Math.round(ev.points / 10))];
    case "pickup":
      return [ev.shipId, PICKUP_TYPES.indexOf(ev.pickup)];
    case "swallowed":
      return [ev.shipId ?? 0, SWALLOWED.indexOf(ev.what)];
    case "collapsed":
      return [Math.min(0xffff, Math.round(ev.range)), 0];
    case "warped":
      return [ev.shipId, ev.arrive ? 1 : 0];
    case "ability":
      return [ev.shipId, ABILITY_TYPES.indexOf(ev.ability)];
    default:
      return assertNever(ev);
  }
}

export function encodeSnapshot({ tick, ack, entities, events }: Snapshot): ArrayBuffer {
  let size = HEADER + 1 + events.length * EVENT_SIZE;
  for (const e of entities) size += SIZE[e.kind];
  const view = new DataView(new ArrayBuffer(size));
  view.setUint8(0, MessageType.snapshot);
  view.setUint8(1, BINARY_VERSION);
  view.setUint32(2, tick, true);
  view.setUint32(ACK_OFFSET, ack, true);
  view.setUint16(10, entities.length, true);
  let o = HEADER;
  for (const e of entities) o = writeEntity(view, o, e);
  view.setUint8(o, events.length);
  o += 1;
  for (const ev of events) {
    const [a, b] = eventFields(ev);
    view.setUint8(o, EVENT_CODE[ev.type]);
    view.setFloat32(o + 1, ev.x, true);
    view.setFloat32(o + 5, ev.y, true);
    view.setUint16(o + 9, a, true);
    view.setUint8(o + 11, b);
    o += EVENT_SIZE;
  }
  return view.buffer;
}

export function setAck(buffer: ArrayBuffer, ack: Seq): void {
  new DataView(buffer).setUint32(ACK_OFFSET, ack, true);
}

function kindAt(code: number): EntitySnap["kind"] {
  switch (code) {
    case 1:
      return "ship";
    case 2:
      return "bullet";
    case 3:
      return "asteroid";
    case 4:
      return "pickup";
    case 5:
      return "well";
    case 6:
      return "missile";
    default:
      throw new CodecError(`unknown kind ${code}`);
  }
}

function readEntity(view: DataView, o: number): EntitySnap {
  const kind = kindAt(view.getUint8(o + 2));
  if (o + SIZE[kind] > view.byteLength) throw new CodecError("snapshot truncated");
  const id = readId(view, o);
  const x = view.getFloat32(o + 3, true);
  const y = view.getFloat32(o + 7, true);
  const p = o + COMMON;
  switch (kind) {
    case "ship":
      return {
        kind,
        id,
        x,
        y,
        vx: view.getFloat32(p, true),
        vy: view.getFloat32(p + 4, true),
        angle: view.getInt16(p + 8, true) / ANGLE_SCALE,
        hp: view.getUint8(p + 10),
        flags: view.getUint8(p + 11),
        score: view.getUint16(p + 12, true),
        respawn: view.getUint8(p + 14),
        ability: abilityOrNull(view.getUint8(p + 15)),
        charge: view.getUint8(p + 16),
      };
    case "missile":
      return {
        kind,
        id,
        x,
        y,
        vx: view.getFloat32(p, true),
        vy: view.getFloat32(p + 4, true),
        owner: readId(view, p + 8),
        type: missileAt(view.getUint8(p + 10)),
      };
    case "bullet":
      return {
        kind,
        id,
        x,
        y,
        vx: view.getFloat32(p, true),
        vy: view.getFloat32(p + 4, true),
        owner: readId(view, p + 8),
        shot: readSeq(view, p + 10),
      };
    case "asteroid":
      return {
        kind,
        id,
        x,
        y,
        angle: view.getInt16(p, true) / ANGLE_SCALE,
        radius: view.getUint8(p + 2),
        hunter: view.getUint8(p + 3) === 1,
      };
    case "pickup":
      return { kind, id, x, y, type: pickupAt(view.getUint8(p)) };
    case "well":
      return {
        kind,
        id,
        x,
        y,
        vx: view.getFloat32(p, true),
        vy: view.getFloat32(p + 4, true),
        angle: view.getInt16(p + 8, true) / ANGLE_SCALE,
        type: wellAt(view.getUint8(p + 10)),
        mass: view.getUint16(p + 11, true),
      };
    default:
      return assertNever(kind);
  }
}

function readEvent(view: DataView, o: number): NetEvent {
  const code = view.getUint8(o);
  const x = view.getFloat32(o + 1, true);
  const y = view.getFloat32(o + 5, true);
  const b = view.getUint8(o + 11);
  switch (code) {
    case EVENT_CODE.fired:
      return { type: "fired", x, y, shipId: readId(view, o + 9) };
    case EVENT_CODE.hit:
      return {
        type: "hit",
        x,
        y,
        target: b === 1 ? "ship" : "asteroid",
        shipId: readOptionalId(view, o + 9),
      };
    case EVENT_CODE.exploded:
      return { type: "exploded", x, y, size: b / 10 };
    case EVENT_CODE.scored:
      return { type: "scored", x, y, shipId: readId(view, o + 9), points: b * 10 };
    case EVENT_CODE.pickup:
      return { type: "pickup", x, y, shipId: readId(view, o + 9), pickup: pickupAt(b) };
    case EVENT_CODE.swallowed:
      return { type: "swallowed", x, y, what: swallowedAt(b), shipId: readOptionalId(view, o + 9) };
    case EVENT_CODE.collapsed:
      return { type: "collapsed", x, y, range: view.getUint16(o + 9, true) };
    case EVENT_CODE.warped:
      return { type: "warped", x, y, shipId: readId(view, o + 9), arrive: b === 1 };
    case EVENT_CODE.ability:
      return { type: "ability", x, y, shipId: readId(view, o + 9), ability: abilityAt(b) };
    default:
      throw new CodecError(`unknown event ${code}`);
  }
}

export function decodeSnapshot(data: Bytes): Snapshot {
  const view = toView(data);
  header(view, MessageType.snapshot);
  if (view.byteLength < HEADER + 1) throw new CodecError("snapshot too short");
  const tick = readTick(view, 2);
  const ack = readSeq(view, ACK_OFFSET);
  const count = view.getUint16(10, true);
  const entities: EntitySnap[] = [];
  let o = HEADER;
  for (let i = 0; i < count; i++) {
    if (o + COMMON > view.byteLength) throw new CodecError("snapshot truncated");
    const entity = readEntity(view, o);
    entities.push(entity);
    o += SIZE[entity.kind];
  }
  if (o + 1 > view.byteLength) throw new CodecError("snapshot truncated");
  const eventCount = view.getUint8(o);
  o += 1;
  if (o + eventCount * EVENT_SIZE !== view.byteLength)
    throw new CodecError("snapshot length mismatch");
  const events: NetEvent[] = [];
  for (let i = 0; i < eventCount; i++, o += EVENT_SIZE) events.push(readEvent(view, o));
  return { tick, ack, entities, events };
}
