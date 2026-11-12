import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  test("empty env gives defaults", () => {
    const config = loadConfig({});
    expect(config.port).toBe(8080);
    expect(config.maxPlayersPerRoom).toBe(8);
    expect(config.demoEndpoints).toBe(false);
  });

  test("blank values count as missing", () => {
    expect(loadConfig({ PORT: "" }).port).toBe(8080);
  });

  test("numbers are parsed from strings", () => {
    expect(loadConfig({ PORT: "3000", HEARTBEAT_MS: "500" })).toMatchObject({
      port: 3000,
      heartbeatMs: 500,
    });
  });

  test("bad values list every problem", () => {
    expect(() => loadConfig({ PORT: "99999", MAX_ROOMS: "zero" })).toThrow(/PORT[\s\S]*MAX_ROOMS/);
  });

  test("the config is frozen", () => {
    expect(Object.isFrozen(loadConfig({}))).toBe(true);
  });
});
