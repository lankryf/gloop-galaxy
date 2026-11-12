import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { ARENA_NAMES } from "@gloop/shared/arenas.ts";
import { z } from "zod";
import type { ServerConfig } from "./config.ts";
import { listReplays, replayPath } from "./log/replay.ts";
import type { Logger } from "./logger.ts";
import { errorMessage } from "./logger.ts";
import type { RoomManager } from "./rooms.ts";
import { RoomError } from "./rooms.ts";

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

const MAX_BODY = 4 * 1024;

let lastElu = performance.eventLoopUtilization();
let lastCpu = { usage: process.cpuUsage(), at: performance.now() };

const AddBotsSchema = z.object({ count: z.number().int().min(1).max(16) });

const NewRoomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name must be 1-32 characters")
    .max(32, "name must be 1-32 characters"),
  arena: z.enum(ARENA_NAMES),
});

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
  });
  res.end(data);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    throw new HttpError(415, "Expected application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY) throw new HttpError(413, "Body too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function resolveStatic(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split(/[\\/]/).includes("..")) return null;
  const file = path.resolve(root, `.${decoded === "/" ? "/index.html" : decoded}`);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

async function fileSize(file: string): Promise<number | null> {
  try {
    const info = await stat(file);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  url: URL,
): Promise<void> {
  const file = resolveStatic(root, url.pathname);
  if (!file) throw new HttpError(400, "Bad path");
  const size = await fileSize(file);
  if (size === null) throw new HttpError(404, "Not found");
  const type = MIME[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Content-Length": size });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  await pipeline(createReadStream(file), res);
}

async function streamReplay(
  res: ServerResponse,
  logDir: string,
  id: string,
  buffered: boolean,
): Promise<void> {
  const file = replayPath(logDir, id);
  if (!file) throw new HttpError(400, "Bad replay id");
  const size = await fileSize(file);
  if (size === null) throw new HttpError(404, "No such replay");
  res.writeHead(200, { "Content-Type": "application/x-ndjson", "Content-Length": size });
  if (buffered) {
    res.end(await readFile(file));
    return;
  }
  await pipeline(createReadStream(file), res);
}

function busy(ms: number): number {
  const end = performance.now() + ms;
  let n = 0;
  while (performance.now() < end) n++;
  return n;
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  { rooms, config, startedAt }: { rooms: RoomManager; config: ServerConfig; startedAt: number },
): Promise<void> {
  if (url.pathname === "/health") {
    return json(res, 200, {
      status: "ok",
      uptime: Math.round((Date.now() - startedAt) / 1000),
      rooms: rooms.list().length,
      players: rooms.playerCount,
    });
  }

  if (url.pathname === "/api/rooms") {
    if (req.method === "GET") return json(res, 200, rooms.list());
    if (req.method === "POST") {
      const body = NewRoomSchema.safeParse(await readJsonBody(req));
      if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? "Invalid room");
      return json(res, 201, rooms.create(body.data).info);
    }
    throw new HttpError(405, "Method not allowed");
  }

  const bots = url.pathname.match(/^\/api\/rooms\/([^/]+)\/bots$/);
  if (bots?.[1]) {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const body = AddBotsSchema.safeParse(await readJsonBody(req));
    if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? "Invalid count");
    return json(res, 201, rooms.addBots(bots[1], body.data.count).info);
  }

  if (url.pathname === "/api/stats" && req.method === "GET") {
    const elu = performance.eventLoopUtilization();
    const window = performance.eventLoopUtilization(elu, lastElu);
    lastElu = elu;
    const cpu = process.cpuUsage(lastCpu.usage);
    const wall = performance.now() - lastCpu.at;
    lastCpu = { usage: process.cpuUsage(), at: performance.now() };
    return json(res, 200, {
      matches: rooms.stats(),
      memory: process.memoryUsage().rss,
      eventLoop: {
        utilization: Number(window.utilization.toFixed(3)),
        sinceMs: Math.round(window.idle + window.active),
      },
      cpu: Number(((cpu.user + cpu.system) / 1000 / wall).toFixed(3)),
    });
  }

  if (url.pathname === "/api/replays" && req.method === "GET") {
    return json(res, 200, await listReplays(config.logDir));
  }

  const replay = url.pathname.match(/^\/api\/replays\/([^/]+)$/);
  if (replay?.[1] && req.method === "GET") {
    return streamReplay(res, config.logDir, replay[1], url.searchParams.has("buffered"));
  }

  if (url.pathname === "/api/slow" && config.demoEndpoints) {
    const ms = Math.min(2000, Number(url.searchParams.get("ms") ?? 300));
    busy(ms);
    return json(res, 200, { blockedFor: ms });
  }

  if (url.pathname.startsWith("/api/")) throw new HttpError(404, "Unknown endpoint");
  if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Method not allowed");
  return serveStatic(req, res, config.staticDir, url);
}

export function createHandler({
  rooms,
  config,
  logger,
  startedAt = Date.now(),
}: {
  rooms: RoomManager;
  config: ServerConfig;
  logger: Logger;
  startedAt?: number;
}): RequestListener {
  return (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    route(req, res, url, { rooms, config, startedAt }).catch((error: unknown) => {
      const status =
        error instanceof HttpError ? error.status : error instanceof RoomError ? 409 : 500;
      if (status === 500)
        logger.error("request failed", { url: req.url, error: errorMessage(error) });
      if (res.headersSent) {
        res.destroy();
        return;
      }
      json(res, status, { error: status === 500 ? "Internal error" : errorMessage(error) });
    });
  };
}
