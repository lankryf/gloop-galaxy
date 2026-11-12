import type { InputRecord, Snapshot } from "../protocol.ts";
import * as binary from "./binary.ts";
import * as json from "./json.ts";

export type CodecName = "json" | "binary";

export interface Codec {
  readonly name: CodecName;
  encodeInput(inputs: readonly InputRecord[]): string | ArrayBuffer;
  encodeSnapshot(snapshot: Snapshot): string | ArrayBuffer;
}

export const binaryCodec: Codec = {
  name: "binary",
  encodeInput: binary.encodeInput,
  encodeSnapshot: binary.encodeSnapshot,
};

export const jsonCodec: Codec = {
  name: "json",
  encodeInput: json.encodeInput,
  encodeSnapshot: json.encodeSnapshot,
};

export function codecFor(name: CodecName): Codec {
  return name === "json" ? jsonCodec : binaryCodec;
}
