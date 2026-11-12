import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import type { MatchEvent } from "./events.ts";
import { MatchEventSchema } from "./events.ts";

export const REPLAY_ID = /^[a-z0-9-]{1,80}$/;

export interface ReplayInfo {
  readonly id: string;
  readonly bytes: number;
  readonly modified: Date;
}

export class ReplayError extends Error {}

export async function* readEvents(file: string): AsyncGenerator<MatchEvent> {
  const lines = createInterface({
    input: createReadStream(file),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new ReplayError(`${file}:${lineNumber}: invalid JSON`);
    }
    const event = MatchEventSchema.safeParse(value);
    if (!event.success)
      throw new ReplayError(`${file}:${lineNumber}: ${event.error.issues[0]?.message}`);
    yield event.data;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function listReplays(logDir: string): Promise<ReplayInfo[]> {
  let names: string[];
  try {
    names = await readdir(logDir);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const replays: ReplayInfo[] = [];
  for (const name of names) {
    if (!name.endsWith(".ndjson")) continue;
    const info = await stat(path.join(logDir, name));
    replays.push({ id: name.slice(0, -".ndjson".length), bytes: info.size, modified: info.mtime });
  }
  return replays.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

export function replayPath(logDir: string, id: string): string | null {
  if (!REPLAY_ID.test(id)) return null;
  return path.join(logDir, `${id}.ndjson`);
}
