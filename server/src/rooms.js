import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { startMatchLog } from "./log/matchlog.js";

export const ARENAS = ["nebula", "junkyard"];

export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class Room extends EventEmitter {
  constructor({ id, name, arena, maxPlayers, persistent = false }) {
    super();
    this.id = id;
    this.name = name;
    this.arena = arena;
    this.maxPlayers = maxPlayers;
    this.persistent = persistent;
    this.players = new Map();
    this.createdAt = Date.now();
  }

  get info() {
    return {
      id: this.id,
      name: this.name,
      arena: this.arena,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
    };
  }

  get isFull() {
    return this.players.size >= this.maxPlayers;
  }

  get roster() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name }));
  }

  #record(type, data = {}) {
    this.emit("event", { t: Date.now(), room: this.id, type, ...data });
  }

  join(player) {
    if (this.isFull) throw new RoomError("room_full", "Room is full");
    this.players.set(player.id, player);
    this.emit("join", player);
    this.#record("join", { player: player.id, name: player.name });
  }

  leave(playerId, reason = "left") {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.emit("leave", player);
    this.#record("leave", { player: playerId, reason });
    if (this.players.size === 0) this.emit("empty", this);
  }

  chat(playerId, text) {
    const player = this.players.get(playerId);
    if (!player) return;
    const message = { from: player.id, name: player.name, text, t: Date.now() };
    this.emit("chat", message);
    this.#record("chat", { player: player.id, text });
  }

  endMatch() {
    this.#record("end");
    this.emit("closed");
  }
}

export class RoomManager extends EventEmitter {
  #rooms = new Map();
  #nextId = 1;

  constructor({ maxRooms, maxPlayersPerRoom, logDir, logger }) {
    super();
    this.maxRooms = maxRooms;
    this.maxPlayersPerRoom = maxPlayersPerRoom;
    this.logDir = logDir;
    this.logger = logger;
    this.matchLogs = new Set();
    mkdirSync(logDir, { recursive: true });
  }

  create({ name, arena, persistent = false }) {
    if (this.#rooms.size >= this.maxRooms) throw new RoomError("too_many_rooms", "Server is full");
    const id = `room-${this.#nextId++}`;
    const room = new Room({ id, name, arena, maxPlayers: this.maxPlayersPerRoom, persistent });
    this.#rooms.set(id, room);

    room.on("join", () => {
      if (room.players.size === 1) this.#startLog(room);
    });
    room.on("empty", () => {
      room.endMatch();
      if (!room.persistent) this.delete(id);
    });

    if (!persistent) {
      setTimeout(() => {
        if (room.players.size === 0 && this.#rooms.get(id) === room) this.delete(id);
      }, 60_000).unref();
    }

    this.emit("created", room);
    this.logger.info("room created", { room: id, name, arena });
    return room;
  }

  #startLog(room) {
    const { file, done } = startMatchLog(room, this.logDir);
    const tracked = done
      .catch((error) =>
        this.logger.error("match log failed", { room: room.id, error: error.message }),
      )
      .finally(() => this.matchLogs.delete(tracked));
    this.matchLogs.add(tracked);
    this.logger.info("match log started", { room: room.id, file });
  }

  get(id) {
    return this.#rooms.get(id);
  }

  delete(id) {
    const room = this.#rooms.get(id);
    if (!room) return;
    this.#rooms.delete(id);
    room.removeAllListeners();
    this.logger.info("room deleted", { room: id });
  }

  list() {
    return [...this.#rooms.values()].map((r) => r.info);
  }

  get playerCount() {
    let count = 0;
    for (const room of this.#rooms.values()) count += room.players.size;
    return count;
  }

  async closeAll() {
    for (const room of this.#rooms.values()) {
      if (room.players.size > 0) room.endMatch();
    }
    await Promise.allSettled([...this.matchLogs]);
  }
}
