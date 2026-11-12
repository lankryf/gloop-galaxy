import { fetchJson } from "../assets/loader.js";

export class Lobby extends EventTarget {
  #controller = null;
  #timer = 0;

  constructor({ url = "/api/rooms.json", interval = 3000, timeout = 4000 } = {}) {
    super();
    this.url = url;
    this.interval = interval;
    this.timeout = timeout;
    this.rooms = [];
    this.open = false;
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async refresh() {
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    this.#emit("loading");
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(this.timeout)]);
      const rooms = await fetchJson(this.url, { signal });
      this.rooms = rooms;
      this.#emit("rooms", { rooms });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error.name === "TimeoutError" ? "сервер не відповів вчасно" : error.message;
      this.#emit("error", { message });
    }
  }

  start() {
    if (this.open) return;
    this.open = true;
    this.refresh();
    this.#timer = setInterval(() => this.refresh(), this.interval);
  }

  stop() {
    this.open = false;
    clearInterval(this.#timer);
    this.#controller?.abort(new DOMException("Left the lobby", "AbortError"));
    this.#controller = null;
  }

  join(roomId, name) {
    const room = this.rooms.find((r) => r.id === roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    if (room.players >= room.maxPlayers) throw new Error("Кімната заповнена");
    this.stop();
    this.#emit("join", { room, name });
  }
}
