export function encodeInput(inputs) {
  return JSON.stringify({ v: 0, type: "input", inputs });
}

export function decodeInput(msg) {
  if (!Array.isArray(msg.inputs) || msg.inputs.length === 0 || msg.inputs.length > 16) {
    throw new Error("bad input list");
  }
  return msg.inputs.map(({ seq, buttons }) => {
    if (!Number.isInteger(seq) || seq < 0 || !Number.isInteger(buttons))
      throw new Error("bad input");
    return { seq, buttons };
  });
}

export function encodeSnapshot(snapshot) {
  return JSON.stringify({ v: 0, type: "snapshot", ...snapshot });
}

export function decodeSnapshot(msg) {
  const { tick, ack, entities, events } = msg;
  return { tick, ack, entities, events };
}
