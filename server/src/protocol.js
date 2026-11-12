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
    if (!isString(msg.name, 16) || !NAME.test(msg.name))
      return "name must be 1-16 letters or digits";
    return null;
  },
  chat(msg) {
    if (!isString(msg.text, 200)) return "text must be 1-200 characters";
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
