import { on } from "node:events";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export function toNdjson() {
  return new Transform({
    writableObjectMode: true,
    transform(event, _encoding, callback) {
      try {
        callback(null, `${JSON.stringify(event)}\n`);
      } catch (error) {
        callback(error);
      }
    },
  });
}

export function logFileName(roomId, date = new Date()) {
  const stamp = date
    .toISOString()
    .replace(/\..+/, "")
    .replaceAll(":", "-")
    .replace("T", "-")
    .toLowerCase();
  return `${roomId}-${stamp}.ndjson`;
}

export function startMatchLog(room, logDir) {
  const file = path.join(logDir, logFileName(room.id));
  const events = Readable.from(on(room, "event", { close: ["closed"] })).map(([event]) => event);
  const done = pipeline(events, toNdjson(), createWriteStream(file, { flags: "a" }));
  return { file, done };
}
