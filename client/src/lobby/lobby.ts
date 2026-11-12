import { Bus } from "@gloop/shared/bus.ts";
import type { RoomInfo } from "@gloop/shared/protocol.ts";
import { z } from "zod";
import { fetchJson } from "../assets/loader.ts";
import { messageOf } from "../assets/retry.ts";

const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  arena: z.string(),
  players: z.number().int(),
  maxPlayers: z.number().int(),
});
const RoomsSchema = z.array(RoomSchema);
const ErrorBodySchema = z.object({ error: z.string() });

export type LobbyEvents = {
  loading: null;
  rooms: { readonly rooms: readonly RoomInfo[] };
  error: { readonly message: string };
  join: { readonly room: RoomInfo; readonly name: string };
};

export class Lobby {
  #controller: AbortController | null = null;
  #timer = 0;
  readonly events = new Bus<LobbyEvents>();
  readonly url: string;
  readonly interval: number;
  readonly timeout: number;
  rooms: readonly RoomInfo[] = [];
  open = false;

  constructor({ url = "/api/rooms", interval = 3000, timeout = 4000 } = {}) {
    this.url = url;
    this.interval = interval;
    this.timeout = timeout;
  }

  async refresh(): Promise<void> {
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    this.events.emit("loading", null);
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(this.timeout)]);
      const rooms = await fetchJson(this.url, RoomsSchema, { signal });
      this.rooms = rooms;
      this.events.emit("rooms", { rooms });
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      this.events.emit("error", {
        message: timedOut ? "сервер не відповів вчасно" : messageOf(error),
      });
    }
  }

  start(): void {
    if (this.open) return;
    this.open = true;
    void this.refresh();
    this.#timer = window.setInterval(() => void this.refresh(), this.interval);
  }

  stop(): void {
    this.open = false;
    clearInterval(this.#timer);
    this.#controller?.abort(new DOMException("Left the lobby", "AbortError"));
    this.#controller = null;
  }

  async create(name: string, arena: string): Promise<RoomInfo> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arena }),
      signal: AbortSignal.timeout(this.timeout),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = ErrorBodySchema.safeParse(body);
      throw new Error(parsed.success ? parsed.data.error : `HTTP ${response.status}`);
    }
    const room = RoomSchema.parse(body);
    await this.refresh();
    return room;
  }

  join(roomId: string | null, name: string): void {
    const room = this.rooms.find((r) => r.id === roomId);
    if (!room) throw new Error("Оберіть кімнату");
    if (room.players >= room.maxPlayers) throw new Error("Кімната заповнена");
    this.stop();
    this.events.emit("join", { room, name });
  }
}
