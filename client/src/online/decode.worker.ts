import { decodeSnapshot } from "@gloop/shared/codec/binary.ts";

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!(typeof request === "object" && request !== null && "buffer" in request && "at" in request))
    return;
  if (!(request.buffer instanceof ArrayBuffer) || typeof request.at !== "number") return;
  try {
    self.postMessage({
      snapshot: decodeSnapshot(request.buffer),
      at: request.at,
      bytes: request.buffer.byteLength,
    });
  } catch (error: unknown) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      at: request.at,
    });
  }
});
