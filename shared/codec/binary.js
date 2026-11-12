import { BINARY_VERSION, Kind, MessageType } from "../protocol.js";

const ANGLE_SCALE = 10000;

export class CodecError extends Error {}

function toView(data) {
  if (data instanceof ArrayBuffer) return new DataView(data);
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function header(view, type) {
  if (view.byteLength < 2) throw new CodecError("message too short");
  if (view.getUint8(0) !== type) throw new CodecError(`expected message type ${type}`);
  if (view.getUint8(1) !== BINARY_VERSION)
    throw new CodecError(`unsupported version ${view.getUint8(1)}`);
}

function angleToInt(angle) {
  return Math.max(-32767, Math.min(32767, Math.round(angle * ANGLE_SCALE)));
}

export function messageType(data) {
  const view = toView(data);
  return view.byteLength > 0 ? view.getUint8(0) : -1;
}

export function encodeInput(inputs) {
  const view = new DataView(new ArrayBuffer(3 + inputs.length * 5));
  view.setUint8(0, MessageType.input);
  view.setUint8(1, BINARY_VERSION);
  view.setUint8(2, inputs.length);
  let o = 3;
  for (const { seq, buttons } of inputs) {
    view.setUint32(o, seq, true);
    view.setUint8(o + 4, buttons);
    o += 5;
  }
  return view.buffer;
}

export function decodeInput(data) {
  const view = toView(data);
  header(view, MessageType.input);
  if (view.byteLength < 3) throw new CodecError("input too short");
  const count = view.getUint8(2);
  if (count === 0 || count > 16) throw new CodecError(`bad input count ${count}`);
  if (view.byteLength !== 3 + count * 5) throw new CodecError("input length mismatch");
  const inputs = [];
  for (let i = 0, o = 3; i < count; i++, o += 5) {
    inputs.push({ seq: view.getUint32(o, true), buttons: view.getUint8(o + 4) });
  }
  return inputs;
}

const SIZE = {
  [Kind.ship]: 11 + 4 + 4 + 2 + 1 + 1 + 2 + 1,
  [Kind.bullet]: 11 + 4 + 4 + 2 + 4,
  [Kind.asteroid]: 11 + 2 + 1 + 1,
  [Kind.pickup]: 11 + 1,
  [Kind.well]: 11 + 4 + 4 + 2 + 1 + 2,
};
const EVENT_SIZE = 12;
export const ACK_OFFSET = 6;

export function encodeSnapshot({ tick, ack = 0, entities, events = [] }) {
  let size = 12;
  for (const e of entities) size += SIZE[e.kind];
  size += 1 + events.length * EVENT_SIZE;
  const view = new DataView(new ArrayBuffer(size));
  view.setUint8(0, MessageType.snapshot);
  view.setUint8(1, BINARY_VERSION);
  view.setUint32(2, tick, true);
  view.setUint32(ACK_OFFSET, ack, true);
  view.setUint16(10, entities.length, true);
  let o = 12;
  for (const e of entities) {
    view.setUint16(o, e.id, true);
    view.setUint8(o + 2, e.kind);
    view.setFloat32(o + 3, e.x, true);
    view.setFloat32(o + 7, e.y, true);
    o += 11;
    switch (e.kind) {
      case Kind.ship:
        view.setFloat32(o, e.vx, true);
        view.setFloat32(o + 4, e.vy, true);
        view.setInt16(o + 8, angleToInt(e.angle), true);
        view.setUint8(o + 10, e.hp);
        view.setUint8(o + 11, e.flags);
        view.setUint16(o + 12, e.score, true);
        view.setUint8(o + 14, e.respawn);
        o += 15;
        break;
      case Kind.bullet:
        view.setFloat32(o, e.vx, true);
        view.setFloat32(o + 4, e.vy, true);
        view.setUint16(o + 8, e.owner, true);
        view.setUint32(o + 10, e.shot, true);
        o += 14;
        break;
      case Kind.asteroid:
        view.setInt16(o, angleToInt(e.angle), true);
        view.setUint8(o + 2, e.radius);
        view.setUint8(o + 3, e.hunter ? 1 : 0);
        o += 4;
        break;
      case Kind.pickup:
        view.setUint8(o, e.type);
        o += 1;
        break;
      case Kind.well:
        view.setFloat32(o, e.vx, true);
        view.setFloat32(o + 4, e.vy, true);
        view.setInt16(o + 8, angleToInt(e.angle), true);
        view.setUint8(o + 10, e.type);
        view.setUint16(o + 11, e.timeLeft, true);
        o += 13;
        break;
      default:
        throw new CodecError(`unknown kind ${e.kind}`);
    }
  }
  view.setUint8(o, events.length);
  o += 1;
  for (const ev of events) {
    view.setUint8(o, ev.type);
    view.setFloat32(o + 1, ev.x, true);
    view.setFloat32(o + 5, ev.y, true);
    view.setUint16(o + 9, ev.a, true);
    view.setUint8(o + 11, ev.b);
    o += EVENT_SIZE;
  }
  return view.buffer;
}

export function setAck(buffer, ack) {
  new DataView(buffer).setUint32(ACK_OFFSET, ack, true);
}

export function decodeSnapshot(data) {
  const view = toView(data);
  header(view, MessageType.snapshot);
  if (view.byteLength < 13) throw new CodecError("snapshot too short");
  const tick = view.getUint32(2, true);
  const ack = view.getUint32(ACK_OFFSET, true);
  const count = view.getUint16(10, true);
  const entities = [];
  let o = 12;
  for (let i = 0; i < count; i++) {
    if (o + 11 > view.byteLength) throw new CodecError("snapshot truncated");
    const kind = view.getUint8(o + 2);
    if (!SIZE[kind]) throw new CodecError(`unknown kind ${kind}`);
    if (o + SIZE[kind] > view.byteLength) throw new CodecError("snapshot truncated");
    const e = {
      id: view.getUint16(o, true),
      kind,
      x: view.getFloat32(o + 3, true),
      y: view.getFloat32(o + 7, true),
    };
    o += 11;
    switch (kind) {
      case Kind.ship:
        e.vx = view.getFloat32(o, true);
        e.vy = view.getFloat32(o + 4, true);
        e.angle = view.getInt16(o + 8, true) / ANGLE_SCALE;
        e.hp = view.getUint8(o + 10);
        e.flags = view.getUint8(o + 11);
        e.score = view.getUint16(o + 12, true);
        e.respawn = view.getUint8(o + 14);
        break;
      case Kind.bullet:
        e.vx = view.getFloat32(o, true);
        e.vy = view.getFloat32(o + 4, true);
        e.owner = view.getUint16(o + 8, true);
        e.shot = view.getUint32(o + 10, true);
        break;
      case Kind.asteroid:
        e.angle = view.getInt16(o, true) / ANGLE_SCALE;
        e.radius = view.getUint8(o + 2);
        e.hunter = view.getUint8(o + 3) === 1;
        break;
      case Kind.pickup:
        e.type = view.getUint8(o);
        break;
      case Kind.well:
        e.vx = view.getFloat32(o, true);
        e.vy = view.getFloat32(o + 4, true);
        e.angle = view.getInt16(o + 8, true) / ANGLE_SCALE;
        e.type = view.getUint8(o + 10);
        e.timeLeft = view.getUint16(o + 11, true);
        break;
    }
    o += SIZE[kind] - 11;
    entities.push(e);
  }
  if (o + 1 > view.byteLength) throw new CodecError("snapshot truncated");
  const eventCount = view.getUint8(o);
  o += 1;
  if (o + eventCount * EVENT_SIZE !== view.byteLength)
    throw new CodecError("snapshot length mismatch");
  const events = [];
  for (let i = 0; i < eventCount; i++, o += EVENT_SIZE) {
    events.push({
      type: view.getUint8(o),
      x: view.getFloat32(o + 1, true),
      y: view.getFloat32(o + 5, true),
      a: view.getUint16(o + 9, true),
      b: view.getUint8(o + 11),
    });
  }
  return { tick, ack, entities, events };
}
