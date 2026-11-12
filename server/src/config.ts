import path from "node:path";
import { z } from "zod";
import { LOG_LEVELS } from "./logger.ts";

const blankToUndefined = (value: unknown): unknown => (value === "" ? undefined : value);
const int = (fallback: number, min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).default(fallback));
const text = (fallback: string) =>
  z.preprocess(blankToUndefined, z.string().min(1).default(fallback));

const EnvSchema = z.object({
  PORT: int(8080, 1, 65535),
  HOST: text("0.0.0.0"),
  LOG_DIR: text("logs"),
  STATIC_DIR: text("../client/dist"),
  MAX_ROOMS: int(50, 1, 1000),
  MAX_PLAYERS_PER_ROOM: int(16, 1, 64),
  MESSAGES_PER_SECOND: int(20, 1, 1000),
  JOIN_TIMEOUT_MS: int(5000, 100, 600_000),
  HEARTBEAT_MS: int(15000, 100, 600_000),
  DEMO_ENDPOINTS: z.preprocess(blankToUndefined, z.enum(["0", "1"]).default("0")),
  ALLOWED_ORIGINS: z.preprocess(
    blankToUndefined,
    z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url({ protocol: /^https?$/ }))),
  ),
  MAX_CONNECTIONS_PER_IP: int(8, 1, 100_000),
  TRUST_PROXY: z.preprocess(blankToUndefined, z.enum(["0", "1"]).default("0")),
  LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(LOG_LEVELS).default("info")),
  SHUTDOWN_TIMEOUT_MS: int(8000, 100, 60_000),
});

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly logDir: string;
  readonly staticDir: string;
  readonly maxRooms: number;
  readonly maxPlayersPerRoom: number;
  readonly messagesPerSecond: number;
  readonly joinTimeoutMs: number;
  readonly heartbeatMs: number;
  readonly demoEndpoints: boolean;
  readonly allowedOrigins: readonly string[];
  readonly maxConnectionsPerIp: number;
  readonly trustProxy: boolean;
  readonly logLevel: (typeof LOG_LEVELS)[number];
  readonly shutdownTimeoutMs: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid configuration:\n  ${problems.join("\n  ")}`);
  }
  const e = result.data;
  return Object.freeze({
    port: e.PORT,
    host: e.HOST,
    logDir: path.resolve(e.LOG_DIR),
    staticDir: path.resolve(e.STATIC_DIR),
    maxRooms: e.MAX_ROOMS,
    maxPlayersPerRoom: e.MAX_PLAYERS_PER_ROOM,
    messagesPerSecond: e.MESSAGES_PER_SECOND,
    joinTimeoutMs: e.JOIN_TIMEOUT_MS,
    heartbeatMs: e.HEARTBEAT_MS,
    demoEndpoints: e.DEMO_ENDPOINTS === "1",
    allowedOrigins: Object.freeze(e.ALLOWED_ORIGINS),
    maxConnectionsPerIp: e.MAX_CONNECTIONS_PER_IP,
    trustProxy: e.TRUST_PROXY === "1",
    logLevel: e.LOG_LEVEL,
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
  });
}
