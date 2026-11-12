import { randomUUID } from "node:crypto";
import { CodecError, decodeInput, messageType } from "@gloop/shared/codec/binary.js";
import { MessageType, TICK_RATE } from "@gloop/shared/protocol.js";
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
  for (const player of room.players.values()) player.send(data, options);
}

function createNetsim() {
  const settings = { lag: 0, jitter: 0, drop: 0 };
  return {
    settings,
    set({ lag, jitter, drop }) {
      Object.assign(settings, { lag, jitter, drop });
    },
    run(fn, { droppable = false } = {}) {
      if (droppable && settings.drop > 0 && Math.random() < settings.drop) return;
      const delay = settings.lag + Math.random() * settings.jitter;
      if (delay <= 0) fn();
      else setTimeout(fn, delay);
    },
  };
}

function netsimFromUrl(url) {
  const params = new URL(url, "http://localhost").searchParams;
  const clamp = (value, max) => (Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0);
  return {
    lag: clamp(Number(params.get("lag") ?? 0), 1000),
    jitter: clamp(Number(params.get("jitter") ?? 0), 1000),
    drop: clamp(Number(params.get("drop") ?? 0), 0.5),
  };
}

export function attachSockets(wss, { rooms, config, logger }) {
  const wired = new WeakSet();

  function wire(room) {
    if (wired.has(room)) return;
    wired.add(room);
    const sendRoster = () => broadcast(room, encode("roster", { players: room.roster }));
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
    const netsim = createNetsim();
    if (config.demoEndpoints) netsim.set(netsimFromUrl(req.url));

    const state = {
      player: null,
      room: null,
      codec: "binary",
      bucket: new TokenBucket({
        ratePerSecond: config.messagesPerSecond,
        burst: config.messagesPerSecond * 2,
      }),
      inputBucket: new TokenBucket({ ratePerSecond: TICK_RATE * 2, burst: TICK_RATE * 3 }),
      closing: false,
    };
    ws.state = state;
    ws.missedPongs = 0;

    const deliver = (data, { critical = true, kind = "control" } = {}) => {
      netsim.run(() => send(ws, data, { critical }), { droppable: kind === "snapshot" });
    };

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
      const player = { id: randomUUID().slice(0, 8), name: msg.name, socket: ws, send: deliver };
      wire(room);
      clearTimeout(joinTimer);
      state.player = player;
      state.room = room;
      state.codec = msg.codec ?? "binary";
      room.join(player);
      const ship = room.match.addPlayer(player, { codec: state.codec, send: deliver });
      player.shipId = ship.id;
      deliver(
        encode("welcome", {
          you: player.id,
          shipId: ship.id,
          room: room.info,
          codec: state.codec,
          tickRate: TICK_RATE,
          netsim: netsim.settings,
        }),
      );
      broadcast(room, encode("roster", { players: room.roster }));
      logger.info("player joined", { room: room.id, player: player.id, name: player.name });
    }

    function handleInputs(inputs) {
      if (!state.player) return reject(CloseCode.badMessage, "join first");
      if (!state.inputBucket.take()) return reject(CloseCode.rateLimited, "too many inputs");
      const { room, player } = state;
      netsim.run(() => room.match?.receiveInputs(player.id, inputs), { droppable: true });
    }

    function handleText(msg) {
      if (msg.type === "input") return handleInputs(msg.inputs);
      if (!state.bucket.take()) return reject(CloseCode.rateLimited, "too many messages");
      switch (msg.type) {
        case "join":
          return handleJoin(msg);
        case "chat":
          if (!state.player) return reject(CloseCode.badMessage, "join first");
          return state.room.chat(state.player.id, msg.text);
        case "ping":
          return netsim.run(() => deliver(encode("pong", { t: msg.t })));
        case "netsim":
          if (!config.demoEndpoints) return reject(CloseCode.badMessage, "netsim is disabled");
          netsim.set(msg);
          return deliver(encode("netsim", netsim.settings));
        case "leave":
          return ws.close(CloseCode.normal, "bye");
      }
    }

    ws.on("message", (data, isBinary) => {
      if (state.closing) return;
      if (!isBinary) {
        const { msg, error } = parseClientMessage(data);
        if (error) return reject(CloseCode.badMessage, error);
        return handleText(msg);
      }
      if (messageType(data) !== MessageType.input) {
        return reject(CloseCode.badMessage, "unknown binary message");
      }
      let inputs;
      try {
        inputs = decodeInput(data);
      } catch (error) {
        if (error instanceof CodecError) return reject(CloseCode.badMessage, error.message);
        throw error;
      }
      handleInputs(inputs);
    });

    ws.on("close", (code) => {
      clearTimeout(joinTimer);
      if (state.player) {
        state.room.match?.removePlayer(state.player.id);
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
