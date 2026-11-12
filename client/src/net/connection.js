const FATAL = new Set([4000, 4003, 4004]);

export class Connection extends EventTarget {
  #ws = null;
  #queue = [];
  #attempt = 0;
  #timer = 0;
  #closedByUser = false;

  constructor(url, { maxQueue = 100, maxDelay = 10_000 } = {}) {
    super();
    this.url = url;
    this.maxQueue = maxQueue;
    this.maxDelay = maxDelay;
    this.status = "idle";
    this.last = new Map();
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  #setStatus(status) {
    this.status = status;
    this.#emit("status", { status });
  }

  connect() {
    this.#closedByUser = false;
    this.#open();
  }

  #open() {
    this.#setStatus("connecting");
    const ws = new WebSocket(this.url);
    this.#ws = ws;

    ws.addEventListener("open", () => {
      this.#attempt = 0;
      this.#setStatus("open");
      this.#emit("open");
      this.#flush();
    });

    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        console.warn("bad message from server", event.data);
        return;
      }
      this.last.set(msg.type, msg);
      this.#emit(msg.type, msg);
    });

    ws.addEventListener("close", (event) => {
      this.#ws = null;
      this.#emit("closed", { code: event.code, reason: event.reason });
      if (this.#closedByUser || FATAL.has(event.code)) {
        this.#setStatus("closed");
        return;
      }
      this.#scheduleReconnect();
    });
  }

  #scheduleReconnect() {
    this.#attempt += 1;
    const cap = Math.min(this.maxDelay, 500 * 2 ** this.#attempt);
    const delay = Math.round(cap / 2 + (Math.random() * cap) / 2);
    this.#setStatus("reconnecting");
    this.#emit("reconnecting", { attempt: this.#attempt, delay });
    this.#timer = setTimeout(() => this.#open(), delay);
  }

  #flush() {
    while (this.#queue.length > 0 && this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(this.#queue.shift());
    }
  }

  send(type, payload = {}) {
    const data = JSON.stringify({ v: 0, type, ...payload });
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(data);
      return;
    }
    this.#queue.push(data);
    if (this.#queue.length > this.maxQueue) this.#queue.shift();
  }

  close() {
    this.#closedByUser = true;
    clearTimeout(this.#timer);
    this.#queue.length = 0;
    this.#ws?.close(1000, "bye");
  }
}

export function socketUrl(path = "/ws") {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}${path}`;
}
