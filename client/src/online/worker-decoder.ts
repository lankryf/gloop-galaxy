import type { Snapshot } from "@gloop/shared/protocol.ts";
import { Samples } from "../perf.ts";

export interface DecodedReply {
  readonly snapshot: Snapshot;
  readonly at: number;
  readonly bytes: number;
}

function isReply(data: unknown): data is DecodedReply {
  if (typeof data !== "object" || data === null) return false;
  if (!("snapshot" in data) || !("at" in data) || !("bytes" in data)) return false;
  const { snapshot } = data;
  return (
    typeof snapshot === "object" &&
    snapshot !== null &&
    "entities" in snapshot &&
    Array.isArray(snapshot.entities) &&
    "events" in snapshot &&
    Array.isArray(snapshot.events)
  );
}

export class WorkerDecoder {
  readonly latency = new Samples();
  readonly mainThread = new Samples();
  readonly #worker: Worker;

  constructor(onSnapshot: (snapshot: Snapshot, bytes: number) => void) {
    this.#worker = new Worker(new URL("./decode.worker.ts", import.meta.url), { type: "module" });
    this.#worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const started = performance.now();
      const data = event.data;
      if (!isReply(data)) return;
      this.mainThread.push(performance.now() - started);
      this.latency.push(started - data.at);
      onSnapshot(data.snapshot, data.bytes);
    });
  }

  decode(buffer: ArrayBuffer): void {
    this.#worker.postMessage({ buffer, at: performance.now() }, [buffer]);
  }

  stop(): void {
    this.#worker.terminate();
  }
}
