import { decodeSnapshot, encodeInput } from "@gloop/shared/codec/binary.ts";
import { seq } from "@gloop/shared/ids.ts";
import { CloseCode } from "@gloop/shared/protocol.ts";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { TestServer } from "./helpers.ts";
import { startTestServer, TestClient } from "./helpers.ts";

let server: TestServer;
const clients: TestClient[] = [];

function client(options = {}): TestClient {
  const c = new TestClient(server.ws, options);
  clients.push(c);
  return c;
}

async function joined(name: string): Promise<TestClient> {
  const c = client();
  await c.opened();
  c.send({ v: 0, type: "join", room: server.roomId, name });
  await c.next("welcome");
  return c;
}

describe("websocket server", () => {
  beforeEach(async () => {
    server = await startTestServer({ HEARTBEAT_MS: "100", MESSAGES_PER_SECOND: "5" });
  });

  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await server.close();
  });

  test("join gets a welcome, a roster and binary snapshots", async () => {
    const a = await joined("Olek");
    const roster = await a.next("roster");
    expect(roster.players.map((p) => p.name)).toContain("Olek");
    await expect.poll(() => a.binary.length).toBeGreaterThan(2);
    const first = a.binary[0];
    expect(first && decodeSnapshot(first).entities.some((e) => e.kind === "ship")).toBe(true);
  });

  test("the second player shows up in the first player's roster", async () => {
    const a = await joined("Olek");
    await joined("Marta");
    await expect
      .poll(async () => (await a.next("roster")).players.map((p) => p.name).sort())
      .toEqual(["Marta", "Olek"]);
  });

  test("inputs move the ship and come back as ack", async () => {
    const a = await joined("Olek");
    for (let i = 1; i <= 10; i++) a.socket.send(encodeInput([{ seq: seq(i), buttons: 1 }]));
    await expect
      .poll(() => {
        const last = a.binary.at(-1);
        return last ? decodeSnapshot(last).ack : 0;
      })
      .toBe(10);
  });

  test("garbage closes the socket with 4000", async () => {
    const c = client();
    await c.opened();
    c.send("{nope");
    expect((await c.closed).code).toBe(CloseCode.badMessage);
  });

  test("flooding closes the socket with 4002", async () => {
    const a = await joined("Olek");
    for (let i = 0; i < 40; i++) a.send({ v: 0, type: "ping", t: i });
    expect((await a.closed).code).toBe(CloseCode.rateLimited);
  });

  test("a client that never answers pings is dropped", async () => {
    const c = client({ autoPong: false });
    await c.opened();
    c.send({ v: 0, type: "join", room: server.roomId, name: "Mute" });
    const { code } = await c.closed;
    expect(code).toBe(1006);
  });

  test("chat reaches everyone in the room", async () => {
    const a = await joined("Olek");
    const b = await joined("Marta");
    b.send({ v: 0, type: "chat", text: "привіт" });
    expect((await a.next("chat")).text).toBe("привіт");
  });
});
