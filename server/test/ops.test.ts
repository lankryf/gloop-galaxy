import { CloseCode } from "@gloop/shared/protocol.ts";
import { afterEach, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { loadConfig } from "../src/config.ts";
import { metrics } from "../src/metrics.ts";
import type { TestServer } from "./helpers.ts";
import { startTestServer, TestClient } from "./helpers.ts";

let server: TestServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

function upgradeStatus(url: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    ws.on("open", () => {
      resolve(101);
      ws.close();
    });
    ws.on("error", () => resolve(0));
  });
}

describe("health, readiness, metrics", () => {
  test("/health reports version and commit", async () => {
    server = await startTestServer();
    const body = await (await fetch(`${server.http}/health`)).json();
    expect(body).toMatchObject({
      status: "ok",
      version: expect.any(String),
      commit: expect.any(String),
    });
  });

  test("/ready is 200 while serving", async () => {
    server = await startTestServer();
    expect((await fetch(`${server.http}/ready`)).status).toBe(200);
  });

  test("/metrics exposes game metrics in Prometheus format", async () => {
    server = await startTestServer();
    const text = await (await fetch(`${server.http}/metrics`)).text();
    for (const name of [
      "gloop_players",
      "gloop_rooms",
      "gloop_tick_p99_ms",
      "gloop_event_loop_utilization",
    ]) {
      expect(text).toContain(name);
    }
    expect(text).toContain('gloop_rejections_total{reason="origin"}');
    expect(text).toContain("gloop_process_resident_memory_bytes");
  });
});

describe("connection gate", () => {
  test("a foreign Origin is refused with 403 and counted", async () => {
    server = await startTestServer({ ALLOWED_ORIGINS: "https://gloop.example" });
    const before = await metrics.rejectionCount("origin");
    expect(await upgradeStatus(server.ws, { Origin: "https://evil.example" })).toBe(403);
    expect(await upgradeStatus(server.ws, { Origin: "https://gloop.example" })).toBe(101);
    expect(await metrics.rejectionCount("origin")).toBe(before + 1);
  });

  test("without ALLOWED_ORIGINS only the same host is allowed", async () => {
    server = await startTestServer();
    const host = new URL(server.http).host;
    expect(await upgradeStatus(server.ws, { Origin: `http://${host}` })).toBe(101);
    expect(await upgradeStatus(server.ws, { Origin: "http://other.example" })).toBe(403);
  });

  test("the per-IP cap refuses the extra connection and frees the slot on close", async () => {
    server = await startTestServer({ MAX_CONNECTIONS_PER_IP: "2" });
    const a = new TestClient(server.ws);
    const b = new TestClient(server.ws);
    await Promise.all([a.opened(), b.opened()]);
    expect(await upgradeStatus(server.ws)).toBe(429);
    a.close();
    await a.closed;
    await expect.poll(() => upgradeStatus(server?.ws ?? "")).toBe(101);
    b.close();
  });
});

describe("graceful shutdown", () => {
  test("clients get a shutdown message and close code 1001", async () => {
    server = await startTestServer();
    const c = new TestClient(server.ws);
    await c.opened();
    c.send({ v: 0, type: "join", room: server.roomId, name: "Olek" });
    await c.next("welcome");
    const started = performance.now();
    const closing = server.close();
    expect(await c.next("shutdown")).toMatchObject({ type: "shutdown" });
    expect((await c.closed).code).toBe(CloseCode.goingAway);
    await closing;
    expect(performance.now() - started).toBeLessThan(10_000);
    server = null;
  });

  test("new connections are refused once shutdown started", async () => {
    server = await startTestServer();
    const ws = server.ws;
    const closing = server.close();
    server = null;
    expect([0, 503]).toContain(await upgradeStatus(ws));
    await closing;
  });
});

describe("config", () => {
  test("ALLOWED_ORIGINS is a comma-separated list of URLs", () => {
    expect(
      loadConfig({ ALLOWED_ORIGINS: "https://a.example, https://b.example" }).allowedOrigins,
    ).toEqual(["https://a.example", "https://b.example"]);
    expect(() => loadConfig({ ALLOWED_ORIGINS: "not a url" })).toThrow(/ALLOWED_ORIGINS/);
  });

  test("LOG_LEVEL must be a pino level", () => {
    expect(loadConfig({ LOG_LEVEL: "debug" }).logLevel).toBe("debug");
    expect(() => loadConfig({ LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });
});
