import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

export const REPLAY_ID = /^[a-z0-9-]{1,80}$/;

export async function* readEvents(file) {
  const lines = createInterface({
    input: createReadStream(file),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of lines) {
    if (line.trim() === "") continue;
    yield JSON.parse(line);
  }
}

export async function listReplays(logDir) {
  let names;
  try {
    names = await readdir(logDir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const replays = [];
  for (const name of names) {
    if (!name.endsWith(".ndjson")) continue;
    const info = await stat(path.join(logDir, name));
    replays.push({ id: name.slice(0, -".ndjson".length), bytes: info.size, modified: info.mtime });
  }
  return replays.sort((a, b) => b.modified - a.modified);
}

export function replayPath(logDir, id) {
  if (!REPLAY_ID.test(id)) return null;
  return path.join(logDir, `${id}.ndjson`);
}
