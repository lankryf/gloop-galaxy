import path from "node:path";

function int(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}], got "${raw}"`);
  }
  return value;
}

export function loadConfig() {
  const errors = [];
  const read = (fn) => {
    try {
      return fn();
    } catch (error) {
      errors.push(error.message);
      return undefined;
    }
  };

  const config = {
    port: read(() => int("PORT", 8080, { min: 1, max: 65535 })),
    host: process.env.HOST || "0.0.0.0",
    logDir: path.resolve(process.env.LOG_DIR || "logs"),
    staticDir: path.resolve(process.env.STATIC_DIR || "../client/dist"),
    maxRooms: read(() => int("MAX_ROOMS", 50, { min: 1, max: 1000 })),
    maxPlayersPerRoom: read(() => int("MAX_PLAYERS_PER_ROOM", 8, { min: 1, max: 64 })),
    messagesPerSecond: read(() => int("MESSAGES_PER_SECOND", 20, { min: 1, max: 1000 })),
    joinTimeoutMs: read(() => int("JOIN_TIMEOUT_MS", 5000, { min: 100 })),
    heartbeatMs: read(() => int("HEARTBEAT_MS", 15000, { min: 100 })),
    demoEndpoints: process.env.DEMO_ENDPOINTS === "1",
  };

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n  ${errors.join("\n  ")}`);
  }
  return Object.freeze(config);
}
