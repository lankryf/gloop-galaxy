import { MAX_BUTTONS } from "@gloop/shared/protocol.js";

export const PROTOCOL_VERSION = 0;
export const MAX_MESSAGE_BYTES = 2048;

export const CloseCode = {
  normal: 1000,
  goingAway: 1001,
  badMessage: 4000,
  joinTimeout: 4001,
  rateLimited: 4002,
  roomFull: 4003,
  noRoom: 4004,
  heartbeat: 4005,
  slowClient: 4006,
};

const NAME = /^[\p{L}\p{N}_ .-]{1,16}$/u;

function isString(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

const validators = {
  join(msg) {
    if (!isString(msg.room, 32)) return "room must be a non-empty string";
    if (!isString(msg.name, 16) || !NAME.test(msg.name)) {
      return "name must be 1-16 letters or digits";
    }
    if (msg.codec !== undefined && msg.codec !== "json" && msg.codec !== "binary") {
      return "codec must be json or binary";
    }
    return null;
  },
  chat(msg) {
    if (!isString(msg.text, 200)) return "text must be 1-200 characters";
    return null;
  },
  input(msg) {
    if (!Array.isArray(msg.inputs) || msg.inputs.length === 0 || msg.inputs.length > 16) {
      return "inputs must be a list of 1-16 items";
    }
    for (const i of msg.inputs) {
      if (!Number.isInteger(i?.seq) || i.seq < 0 || i.seq > 0xffffffff) return "seq must be uint32";
      if (!Number.isInteger(i.buttons) || i.buttons < 0 || i.buttons > MAX_BUTTONS)
        return "bad buttons";
    }
    return null;
  },
  ping(msg) {
    if (typeof msg.t !== "number" || !Number.isFinite(msg.t)) return "t must be a number";
    return null;
  },
  netsim(msg) {
    for (const key of ["lag", "jitter"]) {
      if (!Number.isInteger(msg[key]) || msg[key] < 0 || msg[key] > 1000)
        return `${key} must be 0-1000 ms`;
    }
    if (typeof msg.drop !== "number" || msg.drop < 0 || msg.drop > 0.5) return "drop must be 0-0.5";
    return null;
  },
  leave() {
    return null;
  },
};

export function parseClientMessage(raw) {
  const size = typeof raw === "string" ? Buffer.byteLength(raw) : raw.length;
  if (size > MAX_MESSAGE_BYTES) return { error: "message too large" };

  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return { error: "invalid JSON" };
  }

  if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
    return { error: "message must be an object" };
  }
  if (msg.v !== PROTOCOL_VERSION) return { error: `unsupported protocol version ${msg.v}` };
  const validate = Object.hasOwn(validators, msg.type) ? validators[msg.type] : null;
  if (!validate) return { error: `unknown message type ${JSON.stringify(msg.type)}` };
  const problem = validate(msg);
  if (problem) return { error: `${msg.type}: ${problem}` };
  return { msg };
}

export function encode(type, payload = {}) {
  return JSON.stringify({ v: PROTOCOL_VERSION, type, ...payload });
}
