import type { InputRecord, Snapshot } from "../protocol.ts";
import { PROTOCOL_VERSION } from "../protocol.ts";

export function encodeInput(inputs: readonly InputRecord[]): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, type: "input", inputs });
}

export function encodeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, type: "snapshot", ...snapshot });
}
