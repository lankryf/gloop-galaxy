import { on } from "node:events";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Room } from "../rooms.ts";
import type { MatchEvent } from "./events.ts";

export function toNdjson(): Transform {
  return new Transform({
    writableObjectMode: true,
    transform(event: unknown, _encoding, callback) {
      try {
        callback(null, `${JSON.stringify(event)}\n`);
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
}

export function logFileName(roomId: string, date = new Date()): string {
  const stamp = date
    .toISOString()
    .replace(/\..+/, "")
    .replaceAll(":", "-")
    .replace("T", "-")
    .toLowerCase();
  return `${roomId}-${stamp}.ndjson`;
}

export function startMatchLog(room: Room, logDir: string): { file: string; done: Promise<void> } {
  const file = path.join(logDir, logFileName(room.id));
  const events = Readable.from(on(room, "event", { close: ["closed"] })).map(
    ([event]: [MatchEvent]) => event,
  );
  const done = pipeline(events, toNdjson(), createWriteStream(file, { flags: "a" }));
  return { file, done };
}
