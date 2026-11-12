import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import type { ArenaName } from "@gloop/shared/arenas.ts";
import type { EntityId } from "@gloop/shared/ids.ts";
import type { RoomInfo } from "@gloop/shared/protocol.ts";
import type { MatchEvent } from "./log/events.ts";
import { startMatchLog } from "./log/matchlog.ts";
import type { Logger } from "./logger.ts";
import { errorMessage } from "./logger.ts";
import type { MatchStats } from "./match.ts";
import { Match } from "./match.ts";

export interface DeliverOptions {
  readonly critical?: boolean;
  readonly kind?: "control" | "snapshot";
}

export type Deliver = (data: string | ArrayBuffer, options?: DeliverOptions) => void;

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly send: Deliver;
  shipId: EntityId | null;
}

export interface ChatMessage {
  readonly from: string;
  readonly name: string;
  readonly text: string;
  readonly t: number;
}

export type { MatchEvent };

type RoomEvents = {
  join: [Player];
  leave: [Player];
  chat: [ChatMessage];
  event: [MatchEvent];
  empty: [Room];
  closed: [];
};

export class RoomError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class Room extends EventEmitter<RoomEvents> {
  readonly id: string;
  readonly name: string;
  readonly arena: ArenaName;
  readonly maxPlayers: number;
  readonly persistent: boolean;
  readonly players = new Map<string, Player>();
  readonly createdAt = Date.now();
  match: Match | null = null;

  constructor({
    id,
    name,
    arena,
    maxPlayers,
    persistent = false,
  }: { id: string; name: string; arena: ArenaName; maxPlayers: number; persistent?: boolean }) {
    super();
    this.id = id;
    this.name = name;
    this.arena = arena;
    this.maxPlayers = maxPlayers;
    this.persistent = persistent;
  }

  get info(): RoomInfo {
    return {
      id: this.id,
      name: this.name,
      arena: this.arena,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
    };
  }

  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  get roster(): { id: string; name: string; shipId: EntityId }[] {
    const list: { id: string; name: string; shipId: EntityId }[] = [];
    for (const p of this.players.values()) {
      if (p.shipId !== null) list.push({ id: p.id, name: p.name, shipId: p.shipId });
    }
    return list;
  }

  join(player: Player): void {
    if (this.isFull) throw new RoomError("room_full", "Room is full");
    this.players.set(player.id, player);
    this.emit("join", player);
    this.emit("event", {
      t: Date.now(),
      room: this.id,
      type: "join",
      player: player.id,
      name: player.name,
    });
  }

  leave(playerId: string, reason = "left"): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.emit("leave", player);
    this.emit("event", { t: Date.now(), room: this.id, type: "leave", player: playerId, reason });
    if (this.players.size === 0) this.emit("empty", this);
  }

  chat(playerId: string, text: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.emit("chat", { from: player.id, name: player.name, text, t: Date.now() });
    this.emit("event", { t: Date.now(), room: this.id, type: "chat", player: player.id, text });
  }

  endMatch(): void {
    this.emit("event", { t: Date.now(), room: this.id, type: "end" });
    this.emit("closed");
  }
}

export class RoomManager {
  #rooms = new Map<string, Room>();
  #nextId = 1;
  readonly maxRooms: number;
  readonly maxPlayersPerRoom: number;
  readonly logDir: string;
  readonly logger: Logger;
  readonly matchLogs = new Set<Promise<void>>();

  constructor({
    maxRooms,
    maxPlayersPerRoom,
    logDir,
    logger,
  }: { maxRooms: number; maxPlayersPerRoom: number; logDir: string; logger: Logger }) {
    this.maxRooms = maxRooms;
    this.maxPlayersPerRoom = maxPlayersPerRoom;
    this.logDir = logDir;
    this.logger = logger;
    mkdirSync(logDir, { recursive: true });
  }

  create({
    name,
    arena,
    persistent = false,
  }: {
    name: string;
    arena: ArenaName;
    persistent?: boolean;
  }): Room {
    if (this.#rooms.size >= this.maxRooms) throw new RoomError("too_many_rooms", "Server is full");
    const id = `room-${this.#nextId++}`;
    const room = new Room({ id, name, arena, maxPlayers: this.maxPlayersPerRoom, persistent });
    this.#rooms.set(id, room);

    room.on("join", () => {
      if (room.players.size !== 1) return;
      this.#startLog(room);
      room.match = new Match({ room });
      room.match.start();
    });
    room.on("empty", () => {
      room.match?.stop();
      room.match = null;
      room.endMatch();
      if (!room.persistent) this.delete(id);
    });

    if (!persistent) {
      setTimeout(() => {
        if (room.players.size === 0 && this.#rooms.get(id) === room) this.delete(id);
      }, 60_000).unref();
    }

    this.logger.info("room created", { room: id, name, arena });
    return room;
  }

  #startLog(room: Room): void {
    const { file, done } = startMatchLog(room, this.logDir);
    const tracked: Promise<void> = done
      .catch((error: unknown) =>
        this.logger.error("match log failed", { room: room.id, error: errorMessage(error) }),
      )
      .finally(() => this.matchLogs.delete(tracked));
    this.matchLogs.add(tracked);
    this.logger.info("match log started", { room: room.id, file });
  }

  get(id: string): Room | undefined {
    return this.#rooms.get(id);
  }

  delete(id: string): void {
    const room = this.#rooms.get(id);
    if (!room) return;
    this.#rooms.delete(id);
    room.removeAllListeners();
    this.logger.info("room deleted", { room: id });
  }

  stats(): MatchStats[] {
    const matches: MatchStats[] = [];
    for (const room of this.#rooms.values()) if (room.match) matches.push(room.match.stats());
    return matches;
  }

  list(): RoomInfo[] {
    return [...this.#rooms.values()].map((r) => r.info);
  }

  get playerCount(): number {
    let count = 0;
    for (const room of this.#rooms.values()) count += room.players.size;
    return count;
  }

  async closeAll(): Promise<void> {
    for (const room of this.#rooms.values()) {
      room.match?.stop();
      if (room.players.size > 0) room.endMatch();
    }
    await Promise.allSettled([...this.matchLogs]);
  }
}
