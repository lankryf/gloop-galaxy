import { seq } from "@gloop/shared/ids.ts";
import { packButtons } from "@gloop/shared/protocol.ts";
import { IDLE } from "@gloop/shared/sim/ship.ts";
import { describe, expect, test } from "vitest";
import { Match, snapshotEntities } from "../src/match.ts";
import { Room } from "../src/rooms.ts";

function setup() {
  const room = new Room({ id: "r1", name: "test", arena: "nebula", maxPlayers: 8 });
  const match = new Match({ room });
  const sent: (string | ArrayBuffer)[] = [];
  const player = { id: "p1", name: "Olek", send: () => {}, shipId: null };
  const shipId = match.addPlayer(player, { codec: "binary", send: (data) => sent.push(data) });
  return { match, sent, shipId };
}

describe("Match", () => {
  test("every step sends one snapshot per player", () => {
    const { match, sent } = setup();
    for (let i = 0; i < 5; i++) match.step();
    expect(sent).toHaveLength(5);
  });

  test("old and repeated inputs are ignored", () => {
    const { match } = setup();
    const thrust = packButtons({ ...IDLE, thrust: true });
    match.receiveInputs("p1", [
      { seq: seq(1), buttons: thrust },
      { seq: seq(2), buttons: thrust },
    ]);
    match.receiveInputs("p1", [
      { seq: seq(2), buttons: thrust },
      { seq: seq(1), buttons: thrust },
    ]);
    expect(match.players.get("p1")?.queue.map((i) => i.seq)).toEqual([1, 2]);
  });

  test("a flooded queue keeps only the newest inputs", () => {
    const { match } = setup();
    const inputs = Array.from({ length: 20 }, (_, i) => ({ seq: seq(i + 1), buttons: 0 }));
    match.receiveInputs("p1", inputs);
    expect(match.players.get("p1")?.queue).toHaveLength(8);
    expect(match.players.get("p1")?.lastSeq).toBe(12);
  });

  test("removed players disappear from the next snapshot", () => {
    const { match, shipId } = setup();
    match.removePlayer("p1");
    match.step();
    expect(snapshotEntities(match.world).some((e) => e.id === shipId)).toBe(false);
  });

  test("stats report tick timing", () => {
    const { match } = setup();
    expect(match.stats()).toMatchObject({ room: "r1", players: 1 });
  });
});
