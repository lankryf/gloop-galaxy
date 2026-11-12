import { Bus } from "@gloop/shared/bus.ts";
import type {
  ClientMessage,
  ServerMessage,
  ServerMessageOf,
  ServerMessageType,
} from "@gloop/shared/protocol.ts";
import {
  assertNever,
  FATAL_CLOSE_CODES,
  PROTOCOL_VERSION,
  parseServerMessage,
} from "@gloop/shared/protocol.ts";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

type ServerEvents = { [K in ServerMessageType]: ServerMessageOf<K> };

export type ConnectionEvents = ServerEvents & {
  open: null;
  status: { readonly status: ConnectionStatus };
  closed: { readonly code: number; readonly reason: string };
  reconnecting: { readonly attempt: number; readonly delay: number };
  binary: ArrayBuffer;
};

type ClientType = ClientMessage["type"];
type ClientPayload<T extends ClientType> = Omit<Extract<ClientMessage, { type: T }>, "v" | "type">;

export class Connection {
  #ws: WebSocket | null = null;
  #queue: string[] = [];
  #attempt = 0;
  #timer = 0;
  #closedByUser = false;
  readonly events = new Bus<ConnectionEvents>();
  readonly url: string;
  readonly maxQueue: number;
  readonly maxDelay: number;
  status: ConnectionStatus = "idle";
  lastRoster: ServerMessageOf<"roster"> | null = null;
  bytesIn = 0;
  bytesOut = 0;

  constructor(url: string, { maxQueue = 100, maxDelay = 10_000 } = {}) {
    this.url = url;
    this.maxQueue = maxQueue;
    this.maxDelay = maxDelay;
  }

  #setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.events.emit("status", { status });
  }

  connect(): void {
    this.#closedByUser = false;
    this.#open();
  }

  #dispatch(msg: ServerMessage): void {
    switch (msg.type) {
      case "welcome":
        return this.events.emit("welcome", msg);
      case "roster":
        this.lastRoster = msg;
        return this.events.emit("roster", msg);
      case "chat":
        return this.events.emit("chat", msg);
      case "error":
        return this.events.emit("error", msg);
      case "pong":
        return this.events.emit("pong", msg);
      case "netsim":
        return this.events.emit("netsim", msg);
      case "shutdown":
        return this.events.emit("shutdown", msg);
      case "snapshot":
        return this.events.emit("snapshot", msg);
      default:
        return assertNever(msg);
    }
  }

  #open(): void {
    this.#setStatus("connecting");
    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";
    this.#ws = ws;

    ws.addEventListener("open", () => {
      this.#attempt = 0;
      this.#setStatus("open");
      this.events.emit("open", null);
      this.#flush();
    });

    ws.addEventListener("message", (event: MessageEvent<unknown>) => {
      const { data } = event;
      if (data instanceof ArrayBuffer) {
        this.bytesIn += data.byteLength;
        this.events.emit("binary", data);
        return;
      }
      if (typeof data !== "string") return;
      this.bytesIn += data.length;
      const parsed = parseServerMessage(data);
      if (!parsed.ok) {
        console.warn("bad message from server:", parsed.error);
        return;
      }
      this.#dispatch(parsed.value);
    });

    ws.addEventListener("close", (event) => {
      this.#ws = null;
      this.events.emit("closed", { code: event.code, reason: event.reason });
      if (this.#closedByUser || FATAL_CLOSE_CODES.has(event.code)) {
        this.#setStatus("closed");
        return;
      }
      this.#scheduleReconnect();
    });
  }

  #scheduleReconnect(): void {
    this.#attempt += 1;
    const cap = Math.min(this.maxDelay, 500 * 2 ** this.#attempt);
    const delay = Math.round(cap / 2 + (Math.random() * cap) / 2);
    this.#setStatus("reconnecting");
    this.events.emit("reconnecting", { attempt: this.#attempt, delay });
    this.#timer = window.setTimeout(() => this.#open(), delay);
  }

  #flush(): void {
    while (this.open) {
      const next = this.#queue.shift();
      if (next === undefined) return;
      this.sendRaw(next);
    }
  }

  get open(): boolean {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  sendRaw(data: string | ArrayBuffer): boolean {
    const ws = this.#ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    this.bytesOut += typeof data === "string" ? data.length : data.byteLength;
    ws.send(data);
    return true;
  }

  send<T extends ClientType>(type: T, payload: ClientPayload<T>): void {
    const data = JSON.stringify({ v: PROTOCOL_VERSION, type, ...payload });
    if (this.sendRaw(data)) return;
    this.#queue.push(data);
    if (this.#queue.length > this.maxQueue) this.#queue.shift();
  }

  close(): void {
    this.#closedByUser = true;
    clearTimeout(this.#timer);
    this.#queue.length = 0;
    this.#ws?.close(1000, "bye");
  }
}

export function socketUrl(path = "/ws"): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const page = new URLSearchParams(location.search);
  const query = new URLSearchParams();
  for (const key of ["lag", "jitter", "drop"]) {
    const value = page.get(key);
    if (value !== null) query.set(key, value);
  }
  const suffix = query.size > 0 ? `?${query}` : "";
  return `${scheme}://${location.host}${path}${suffix}`;
}
