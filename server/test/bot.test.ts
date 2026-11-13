import { seq } from "@gloop/shared/ids.ts";
import { unpackButtons } from "@gloop/shared/protocol.ts";
import { createRng } from "@gloop/shared/sim/random.ts";
import { Ship } from "@gloop/shared/sim/ship.ts";
import { Vector2 } from "@gloop/shared/sim/vector.ts";
import { GravityWell } from "@gloop/shared/sim/well.ts";
import { World } from "@gloop/shared/sim/world.ts";
import { afterEach, describe, expect, test } from "vitest";
import { Bot, decide } from "../src/bot.ts";
import type { TestServer } from "./helpers.ts";
import { startTestServer, TestClient } from "./helpers.ts";

describe("bot brain", () => {
  test("turns toward and shoots a ship straight ahead", () => {
    const world = new World();
    const me = world.spawn(new Ship({ pos: new Vector2(400, 400), angle: 0, inputDriven: true }));
    world.spawn(new Ship({ pos: new Vector2(700, 400), inputDriven: true }));
    const controls = decide(world, me, createRng(1));
    expect(controls.left || controls.right).toBe(false);
    expect(controls.thrust).toBe(true);
  });

  test("turns to a ship that is behind it", () => {
    const world = new World();
    const me = world.spawn(new Ship({ pos: new Vector2(400, 400), angle: 0, inputDriven: true }));
    world.spawn(new Ship({ pos: new Vector2(400, 200), inputDriven: true }));
    expect(decide(world, me, createRng(1)).left).toBe(true);
  });

  test("runs away from a black hole instead of chasing", () => {
    const world = new World();
    world.spawn(new GravityWell({ pos: new Vector2(500, 400), type: "blackhole" }));
    const me = world.spawn(new Ship({ pos: new Vector2(400, 400), angle: 0, inputDriven: true }));
    world.spawn(new Ship({ pos: new Vector2(700, 400), inputDriven: true }));
    const controls = decide(world, me, createRng(1));
    expect(controls.fire).toBe(false);
    expect(controls.left || controls.right).toBe(true);
  });

  test("dead bots press nothing", () => {
    const world = new World();
    const me = world.spawn(new Ship({ pos: new Vector2(400, 400), inputDriven: true }));
    me.kill();
    expect(decide(world, me, createRng(1))).toEqual({
      thrust: false,
      left: false,
      right: false,
      fire: false,
      use: false,
      boost: false,
    });
  });

  test("bots send inputs with growing seq like a client would", () => {
    const world = new World();
    const ship = world.spawn(new Ship({ pos: new Vector2(400, 400), inputDriven: true }));
    const bot = new Bot("bot-0", 0);
    const a = bot.think(world, ship);
    const b = bot.think(world, ship);
    expect(b.seq).toBe(seq(a.seq + 1));
    expect(() => unpackButtons(a.buttons)).not.toThrow();
  });
});

describe("POST /api/rooms/:id/bots", () => {
  let server: TestServer;
  afterEach(() => server.close());

  test("adds bots that show up in the roster and fly", async () => {
    server = await startTestServer();
    const c = new TestClient(server.ws);
    await c.opened();
    c.send({ v: 0, type: "join", room: server.roomId, name: "Olek" });
    await c.next("welcome");
    const res = await fetch(`${server.http}/api/rooms/${server.roomId}/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 3 }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ players: 4 });
    await expect.poll(async () => (await c.next("roster")).players.length).toBe(4);
    c.close();
  });

  test("rejects a bad count", async () => {
    server = await startTestServer();
    const res = await fetch(`${server.http}/api/rooms/${server.roomId}/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 100 }),
    });
    expect(res.status).toBe(400);
  });
});
