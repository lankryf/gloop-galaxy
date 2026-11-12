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
import { startHeartbeat } from "./heartbeat.ts";
import type { Logger } from "./logger.ts";
import { TokenBucket } from "./ratelimit.ts";
import type { Deliver, DeliverOptions, Player, Room, RoomManager } from "./rooms.ts";

const SLOW_DROP_BYTES = 64 * 1024;
const SLOW_KILL_BYTES = 1024 * 1024;

interface Connection {
  readonly socket: WebSocket;
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
    ws.close(CloseCode.slowClient, "too slow");
    return false;
  }
  if (!critical && ws.bufferedAmount > SLOW_DROP_BYTES) return false;
  ws.send(data);
  return true;
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
  { rooms, config, logger }: { rooms: RoomManager; config: ServerConfig; logger: Logger },
): { close(code?: number, reason?: string): void } {
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
    (conn) => logger.warn("heartbeat lost", { player: conn.player?.id }),
  );

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const netsim = createNetsim(
      config.demoEndpoints ? netsimFromUrl(req.url) : { lag: 0, jitter: 0, drop: 0 },
    );
    const conn: Connection = {
      socket: ws,
      player: null,
      room: null,
      closing: false,
      missedPongs: 0,
    };
    connections.set(ws, conn);
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
      logger.warn("socket error", {
        player: conn.player?.id,
        error: error.message,
        code: error.code,
      });
    });

    const joinTimer = setTimeout(() => {
      if (!conn.player) ws.close(CloseCode.joinTimeout, "join timeout");
    }, config.joinTimeoutMs);

    function reject(code: number, reason: string): void {
      if (conn.closing) return;
      conn.closing = true;
      logger.warn("closing socket", { player: conn.player?.id, code, reason });
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
      logger.info("player joined", { room: room.id, player: player.id, name: player.name });
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
      const { player, room } = conn;
      if (!player || !room) return;
      room.match?.removePlayer(player.id);
      room.leave(player.id, code === CloseCode.normal ? "left" : `closed ${code}`);
      logger.info("player left", { room: room.id, player: player.id, code });
    });
  });

  return {
    close(code = CloseCode.goingAway, reason = "server shutting down") {
      stopHeartbeat();
      for (const ws of connections.keys()) {
        send(ws, encodeServerMessage("shutdown", {}));
        ws.close(code, reason);
      }
    },
  };
}
