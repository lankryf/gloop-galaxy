type Handler<T> = (detail: T) => void;

interface AbortLike {
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
}
type Handlers<Events> = { [K in keyof Events]?: Handler<Events[K]>[] };

export class Bus<Events extends Record<string, unknown>> {
  #handlers: Handlers<Events> = {};

  on<K extends keyof Events>(
    type: K,
    handler: Handler<Events[K]>,
    options: { signal?: AbortLike } = {},
  ): () => void {
    const list = this.#handlers[type] ?? [];
    this.#handlers[type] = list;
    list.push(handler);
    const off = () => {
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    };
    options.signal?.addEventListener("abort", off, { once: true });
    return off;
  }

  once<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    const off = this.on(type, (detail) => {
      off();
      handler(detail);
    });
    return off;
  }

  emit<K extends keyof Events>(type: K, detail: Events[K]): void {
    const list = this.#handlers[type];
    if (!list) return;
    for (const handler of [...list]) handler(detail);
  }
}
