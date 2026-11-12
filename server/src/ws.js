import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { CloseCode, encode, parseClientMessage } from "./protocol.js";
import { TokenBucket } from "./ratelimit.js";

const SLOW_DROP_BYTES = 64 * 1024;
const SLOW_KILL_BYTES = 1024 * 1024;

export function send(ws, data, { critical = true } = {}) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > SLOW_KILL_BYTES) {
    ws.close(CloseCode.slowClient, "too slow");
    return false;
  }
  if (!critical && ws.bufferedAmount > SLOW_DROP_BYTES) return false;
  ws.send(data);
  return true;
}

function broadcast(room, data, options) {
  for (const player of room.players.values()) send(player.socket, data, options);
}

export function attachSockets(wss, { rooms, config, logger }) {
  const wired = new WeakSet();

  function wire(room) {
    if (wired.has(room)) return;
    wired.add(room);
    const sendRoster = () => broadcast(room, encode("roster", { players: room.roster }));
    room.on("join", sendRoster);
    room.on("leave", sendRoster);
    room.on("chat", (message) => broadcast(room, encode("chat", message), { critical: false }));
  }

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.missedPongs >= 2) {
        logger.warn("heartbeat lost", { player: ws.state?.player?.id });
        ws.terminate();
        continue;
      }
      ws.missedPongs += 1;
      ws.ping();
    }
  }, config.heartbeatMs);

  wss.on("connection", (ws, req) => {
    const state = {
      player: null,
      room: null,
      bucket: new TokenBucket({
        ratePerSecond: config.messagesPerSecond,
        burst: config.messagesPerSecond * 2,
      }),
      address: req.socket.remoteAddress,
      closing: false,
    };
    ws.state = state;
    ws.missedPongs = 0;

    ws.on("pong", () => {
      ws.missedPongs = 0;
    });

    ws.on("error", (error) => {
      logger.warn("socket error", {
        player: state.player?.id,
        error: error.message,
        code: error.code,
      });
    });

    const joinTimer = setTimeout(() => {
      if (!state.player) ws.close(CloseCode.joinTimeout, "join timeout");
    }, config.joinTimeoutMs);

    function reject(code, reason) {
      if (state.closing) return;
      state.closing = true;
      logger.warn("closing socket", { player: state.player?.id, code, reason });
      send(ws, encode("error", { code, message: reason }));
      ws.close(code, reason.slice(0, 120));
    }

    function handleJoin(msg) {
      if (state.player) return reject(CloseCode.badMessage, "already joined");
      const room = rooms.get(msg.room);
      if (!room) return reject(CloseCode.noRoom, "no such room");
      if (room.isFull) return reject(CloseCode.roomFull, "room is full");
      const player = { id: randomUUID().slice(0, 8), name: msg.name, socket: ws };
      wire(room);
      clearTimeout(joinTimer);
      state.player = player;
      state.room = room;
      send(
        ws,
        encode("welcome", {
          you: player.id,
          room: { ...room.info, players: room.players.size + 1 },
        }),
      );
      room.join(player);
      logger.info("player joined", { room: room.id, player: player.id, name: player.name });
    }

    ws.on("message", (data, isBinary) => {
      if (state.closing) return;
      if (!state.bucket.take()) return reject(CloseCode.rateLimited, "too many messages");
      if (isBinary) return reject(CloseCode.badMessage, "binary messages are not supported yet");

      const { msg, error } = parseClientMessage(data);
      if (error) return reject(CloseCode.badMessage, error);

      switch (msg.type) {
        case "join":
          return handleJoin(msg);
        case "chat":
          if (!state.player) return reject(CloseCode.badMessage, "join first");
          return state.room.chat(state.player.id, msg.text);
        case "leave":
          return ws.close(CloseCode.normal, "bye");
      }
    });

    ws.on("close", (code) => {
      clearTimeout(joinTimer);
      if (state.player) {
        state.room.leave(state.player.id, code === CloseCode.normal ? "left" : `closed ${code}`);
        logger.info("player left", { room: state.room.id, player: state.player.id, code });
      }
    });
  });

  return {
    close(code = CloseCode.goingAway, reason = "server shutting down") {
      clearInterval(heartbeat);
      for (const ws of wss.clients) {
        send(ws, encode("shutdown", {}));
        ws.close(code, reason);
      }
    },
  };
}
