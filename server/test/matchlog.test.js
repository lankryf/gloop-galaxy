import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startMatchLog } from "../src/log/matchlog.js";
import { readEvents } from "../src/log/replay.js";
import { Room } from "../src/rooms.js";

test("room events end up in an NDJSON file and can be read back", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gloop-"));
  const room = new Room({ id: "room-9", name: "test", arena: "nebula", maxPlayers: 4 });
  const { file, done } = startMatchLog(room, dir);

  room.join({ id: "a", name: "Olek" });
  room.chat("a", "привіт");
  room.leave("a");
  room.endMatch();
  await done;

  const lines = (await readFile(file, "utf8")).trim().split("\n");
  assert.equal(lines.length, 4);

  const events = [];
  for await (const event of readEvents(file)) events.push(event.type);
  assert.deepEqual(events, ["join", "chat", "leave", "end"]);
});
