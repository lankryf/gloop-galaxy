import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { CodecError, decodeInput, MessageType, messageType } from "@gloop/shared/codec/binary.ts";
import type { ClientMessage, InputRecord, NetsimSettings } from "@gloop/shared/protocol.ts";
import {
  assertNever,
  CloseCode,
  encodeServerMessage,
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  TICK_RATE,
} from "@gloop/shared/protocol.ts";
import type { RawData, WebSocketServer } from "ws";
import { WebSocket } from "ws";
import type { ServerConfig } from "./config.ts";
import type { ConnectionGate } from "./gate.ts";
import { startHeartbeat } from "./heartbeat.ts";
import type { Logger } from "./logger.ts";
import type { RejectionReason } from "./metrics.ts";
import { metrics } from "./metrics.ts";
import { TokenBucket } from "./ratelimit.ts";
import type { Deliver, DeliverOptions, Player, Room, RoomManager } from "./rooms.ts";

const SLOW_DROP_BYTES = 64 * 1024;
const SLOW_KILL_BYTES = 1024 * 1024;

interface Connection {
  readonly socket: WebSocket;
  log: Logger;
  player: Player | null;
  room: Room | null;
  closing: boolean;
  missedPongs: number;
}

export function send(
  ws: WebSocket,
  data: string | ArrayBuffer,
  { critical = true }: DeliverOptions = {},
): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > SLOW_KILL_BYTES) {
    metrics.reject("slow_client");
    ws.close(CloseCode.slowClient, "too slow");
    return false;
  }
  if (!critical && ws.bufferedAmount > SLOW_DROP_BYTES) return false;
  ws.send(data);
  metrics.messagesOut.inc();
  metrics.bytesOut.inc(typeof data === "string" ? Buffer.byteLength(data) : data.byteLength);
  return true;
}

function reasonFor(code: number): RejectionReason {
  switch (code) {
    case CloseCode.rateLimited:
      return "rate_limited";
    case CloseCode.joinTimeout:
      return "join_timeout";
    case CloseCode.roomFull:
      return "room_full";
    case CloseCode.noRoom:
      return "no_room";
    case CloseCode.slowClient:
      return "slow_client";
    case CloseCode.heartbeat:
      return "heartbeat";
    default:
      return "bad_message";
  }
}

function broadcast(room: Room, data: string, options?: DeliverOptions): void {
  for (const player of room.players.values()) player.send(data, options);
}

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return data;
}

function createNetsim(initial: NetsimSettings) {
  let settings = initial;
  return {
    get settings(): NetsimSettings {
      return settings;
    },
    set(next: NetsimSettings): void {
      settings = next;
    },
    run(fn: () => void, { droppable = false } = {}): void {
      if (droppable && settings.drop > 0 && Math.random() < settings.drop) return;
      const delay = settings.lag + Math.random() * settings.jitter;
      if (delay <= 0) fn();
      else setTimeout(fn, delay);
    },
  };
}

function netsimFromUrl(url: string | undefined): NetsimSettings {
  const params = new URL(url ?? "/", "http://localhost").searchParams;
  const clamp = (value: number, max: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
  return {
    lag: clamp(Number(params.get("lag") ?? 0), 1000),
    jitter: clamp(Number(params.get("jitter") ?? 0), 1000),
    drop: clamp(Number(params.get("drop") ?? 0), 0.5),
  };
}

export function attachSockets(
  wss: WebSocketServer,
  {
    rooms,
    config,
    logger,
    gate,
  }: { rooms: RoomManager; config: ServerConfig; logger: Logger; gate: ConnectionGate },
): { close(code?: number, reason?: string): Promise<void> } {
  const wired = new WeakSet<Room>();
  const connections = new Map<WebSocket, Connection>();

  function wire(room: Room): void {
    if (wired.has(room)) return;
    wired.add(room);
    room.on("leave", () =>
      broadcast(room, encodeServerMessage("roster", { players: room.roster })),
    );
    room.on("roster", () =>
      broadcast(room, encodeServerMessage("roster", { players: room.roster })),
    );
    room.on("chat", (message) =>
      broadcast(room, encodeServerMessage("chat", message), { critical: false }),
    );
  }

  const stopHeartbeat = startHeartbeat(
    () => connections.values(),
    config.heartbeatMs,
    (conn) => {
      metrics.reject("heartbeat");
      conn.log.warn("heartbeat lost");
    },
  );

  wss.on("connection", (ws: WebSocket, req: IncomingMessage, ip: string) => {
    const netsim = createNetsim(
      config.demoEndpoints ? netsimFromUrl(req.url) : { lag: 0, jitter: 0, drop: 0 },
    );
    const conn: Connection = {
      socket: ws,
      log: logger.child({ ip }),
      player: null,
      room: null,
      closing: false,
      missedPongs: 0,
    };
    connections.set(ws, conn);
    metrics.connections.inc();
    const bucket = new TokenBucket({
      ratePerSecond: config.messagesPerSecond,
      burst: config.messagesPerSecond * 2,
    });
    const inputBucket = new TokenBucket({ ratePerSecond: TICK_RATE * 2, burst: TICK_RATE * 3 });

    const deliver: Deliver = (data, { critical = true, kind = "control" } = {}) => {
      netsim.run(() => send(ws, data, { critical }), { droppable: kind === "snapshot" });
    };

    ws.on("pong", () => {
      conn.missedPongs = 0;
    });

    ws.on("error", (error: Error & { code?: string }) => {
      conn.log.warn("socket error", {
        error: error.message,
        code: error.code,
      });
    });

    const joinTimer = setTimeout(() => {
      if (conn.player) return;
      metrics.reject("join_timeout");
      ws.close(CloseCode.joinTimeout, "join timeout");
    }, config.joinTimeoutMs);

    function reject(code: number, reason: string): void {
      if (conn.closing) return;
      conn.closing = true;
      metrics.reject(reasonFor(code));
      conn.log.warn("closing socket", { code, reason });
      send(ws, encodeServerMessage("error", { code, message: reason }));
      ws.close(code, reason.slice(0, 120));
    }

    function handleJoin(msg: Extract<ClientMessage, { type: "join" }>): void {
      if (conn.player) return reject(CloseCode.badMessage, "already joined");
      const room = rooms.get(msg.room);
      if (!room) return reject(CloseCode.noRoom, "no such room");
      if (room.isFull) return reject(CloseCode.roomFull, "room is full");
      const player: Player = {
        id: randomUUID().slice(0, 8),
        name: msg.name,
        send: deliver,
        shipId: null,
      };
      wire(room);
      clearTimeout(joinTimer);
      conn.player = player;
      conn.room = room;
      conn.log = conn.log.child({ roomId: room.id, playerId: player.id });
      const codec = msg.codec ?? "binary";
      room.join(player);
      if (!room.match) return reject(CloseCode.noRoom, "room has no match");
      const shipId = room.match.addPlayer(player, { codec, send: deliver });
      player.shipId = shipId;
      deliver(
        encodeServerMessage("welcome", {
          you: player.id,
          shipId,
          room: room.info,
          codec,
          tickRate: TICK_RATE,
          netsim: netsim.settings,
        }),
      );
      broadcast(room, encodeServerMessage("roster", { players: room.roster }));
      conn.log.info("player joined", { name: player.name });
    }

    function handleInputs(inputs: readonly InputRecord[]): void {
      const { player, room } = conn;
      if (!player || !room) return reject(CloseCode.badMessage, "join first");
      if (!inputBucket.take()) return reject(CloseCode.rateLimited, "too many inputs");
      netsim.run(() => room.match?.receiveInputs(player.id, inputs), { droppable: true });
    }

    function handleMessage(msg: ClientMessage): void {
      if (msg.type === "input") return handleInputs(msg.inputs);
      if (!bucket.take()) return reject(CloseCode.rateLimited, "too many messages");
      switch (msg.type) {
        case "join":
          return handleJoin(msg);
        case "chat":
          if (!conn.player || !conn.room) return reject(CloseCode.badMessage, "join first");
          return conn.room.chat(conn.player.id, msg.text);
        case "ping":
          return netsim.run(() => deliver(encodeServerMessage("pong", { t: msg.t })));
        case "netsim": {
          if (!config.demoEndpoints) return reject(CloseCode.badMessage, "netsim is disabled");
          const settings = { lag: msg.lag, jitter: msg.jitter, drop: msg.drop };
          netsim.set(settings);
          return deliver(encodeServerMessage("netsim", settings));
        }
        case "leave":
          return ws.close(CloseCode.normal, "bye");
        default:
          return assertNever(msg);
      }
    }

    ws.on("message", (raw: RawData, isBinary: boolean) => {
      if (conn.closing) return;
      const data = toBuffer(raw);
      metrics.messagesIn.inc({ format: isBinary ? "binary" : "text" });
      metrics.bytesIn.inc(data.length);
      if (data.length > MAX_MESSAGE_BYTES) return reject(CloseCode.badMessage, "message too large");
      if (!isBinary) {
        const parsed = parseClientMessage(data.toString("utf8"));
        if (!parsed.ok) return reject(CloseCode.badMessage, parsed.error);
        return handleMessage(parsed.value);
      }
      if (messageType(data) !== MessageType.input)
        return reject(CloseCode.badMessage, "unknown binary message");
      try {
        handleInputs(decodeInput(data));
      } catch (error: unknown) {
        if (error instanceof CodecError) return reject(CloseCode.badMessage, error.message);
        throw error;
      }
    });

    ws.on("close", (code: number) => {
      clearTimeout(joinTimer);
      connections.delete(ws);
      metrics.connections.dec();
      gate.release(ip);
      const { player, room } = conn;
      if (!player || !room) return;
      room.match?.removePlayer(player.id);
      room.leave(player.id, code === CloseCode.normal ? "left" : `closed ${code}`);
      conn.log.info("player left", { code });
    });
  });

  return {
    async close(code = CloseCode.goingAway, reason = "server shutting down") {
      stopHeartbeat();
      const closed: Promise<void>[] = [];
      for (const ws of connections.keys()) {
        closed.push(new Promise((resolve) => ws.once("close", () => resolve())));
        send(ws, encodeServerMessage("shutdown", {}));
        ws.close(code, reason);
      }
      const timeout = new Promise<void>((resolve) =>
        setTimeout(resolve, config.shutdownTimeoutMs / 2).unref(),
      );
      await Promise.race([Promise.all(closed), timeout]);
      for (const ws of connections.keys()) ws.terminate();
    },
  };
}
