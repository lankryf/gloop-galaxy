import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { listReplays, replayPath } from "./log/replay.js";
import { ARENAS, RoomError } from "./rooms.js";

const MIME = {
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

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
  });
  res.end(data);
}

async function readJsonBody(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    throw new HttpError(415, "Expected application/json");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, "Body too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

function validateRoom(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 32) throw new HttpError(400, "name must be 1-32 characters");
  if (!ARENAS.includes(body.arena))
    throw new HttpError(400, `arena must be one of ${ARENAS.join(", ")}`);
  return { name, arena: body.arena };
}

export function resolveStatic(root, urlPath) {
  let decoded;
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

async function serveStatic(req, res, root) {
  const url = new URL(req.url, "http://localhost");
  const file = resolveStatic(root, url.pathname);
  if (!file) throw new HttpError(400, "Bad path");
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new HttpError(404, "Not found");
  }
  if (!info.isFile()) throw new HttpError(404, "Not found");
  const type = MIME[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Content-Length": info.size });
  if (req.method === "HEAD") return res.end();
  await pipeline(createReadStream(file), res);
}

async function streamReplay(res, logDir, id, buffered) {
  const file = replayPath(logDir, id);
  if (!file) throw new HttpError(400, "Bad replay id");
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new HttpError(404, "No such replay");
  }
  res.writeHead(200, { "Content-Type": "application/x-ndjson", "Content-Length": info.size });
  if (buffered) {
    res.end(await readFile(file));
    return;
  }
  await pipeline(createReadStream(file), res);
}

function busy(ms) {
  const end = performance.now() + ms;
  let n = 0;
  while (performance.now() < end) n++;
  return n;
}

export function createHandler({ rooms, config, logger, startedAt = Date.now() }) {
  return async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    try {
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
          const room = rooms.create(validateRoom(await readJsonBody(req)));
          return json(res, 201, room.info);
        }
        throw new HttpError(405, "Method not allowed");
      }

      if (url.pathname === "/api/replays" && req.method === "GET") {
        return json(res, 200, await listReplays(config.logDir));
      }

      const replay = url.pathname.match(/^\/api\/replays\/([^/]+)$/);
      if (replay && req.method === "GET") {
        return await streamReplay(
          req,
          res,
          config.logDir,
          replay[1],
          url.searchParams.has("buffered"),
        );
      }

      if (url.pathname === "/api/slow" && config.demoEndpoints) {
        const ms = Math.min(2000, Number(url.searchParams.get("ms") ?? 300));
        busy(ms);
        return json(res, 200, { blockedFor: ms });
      }

      if (url.pathname.startsWith("/api/")) throw new HttpError(404, "Unknown endpoint");
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new HttpError(405, "Method not allowed");
      return await serveStatic(req, res, config.staticDir);
    } catch (error) {
      const status =
        error instanceof HttpError ? error.status : error instanceof RoomError ? 409 : 500;
      if (status === 500) logger.error("request failed", { url: req.url, error: error.message });
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      json(res, status, { error: status === 500 ? "Internal error" : error.message });
    }
  };
}
