import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { toNdjson } from "../src/log/matchlog.ts";

const megabytes = Number(process.argv[2] ?? 200);
const logDir = path.resolve(process.env.LOG_DIR || "logs");
const target = megabytes * 1024 * 1024;
const file = path.join(logDir, "synthetic-big.ndjson");

function* events(): Generator<Record<string, unknown>> {
  let written = 0;
  let t = Date.now();
  let i = 0;
  while (written < target) {
    t += 16;
    const event = {
      t,
      room: "synthetic",
      type: i % 50 === 0 ? "chat" : "input",
      player: `p${i % 8}`,
      seq: i,
      thrust: i % 3 === 0,
      angle: Math.round(Math.sin(i / 100) * 1000) / 1000,
    };
    written += JSON.stringify(event).length + 1;
    i++;
    yield event;
  }
}

await mkdir(logDir, { recursive: true });
await pipeline(Readable.from(events()), toNdjson(), createWriteStream(file));
console.log(`wrote ${file} (${megabytes} MB)`);
