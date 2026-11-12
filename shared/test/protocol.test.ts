import { describe, expect, test } from "vitest";
import { codecFor } from "../codec/codec.ts";
import { seq } from "../ids.ts";
import {
  encodeServerMessage,
  MAX_BUTTONS,
  packButtons,
  parseClientMessage,
  parseServerMessage,
  unpackButtons,
} from "../protocol.ts";

describe("buttons", () => {
  test("pack and unpack are inverse for all 16 combinations", () => {
    for (let bits = 0; bits <= MAX_BUTTONS; bits++)
      expect(packButtons(unpackButtons(bits))).toBe(bits);
  });
});

describe("parseClientMessage", () => {
  test("rejects invalid JSON without throwing", () => {
    expect(parseClientMessage("{oops")).toEqual({ ok: false, error: "invalid JSON" });
  });

  test("rejects oversized messages before parsing", () => {
    expect(parseClientMessage(" ".repeat(5000))).toEqual({ ok: false, error: "message too large" });
  });

  test("names must be 1-16 letters or digits", () => {
    const join = (name: string) => JSON.stringify({ v: 0, type: "join", room: "r1", name });
    expect(parseClientMessage(join("Олексій")).ok).toBe(true);
    expect(parseClientMessage(join("<script>")).ok).toBe(false);
    expect(parseClientMessage(join("a".repeat(17))).ok).toBe(false);
  });

  test("input buttons above 15 are rejected", () => {
    const msg = { v: 0, type: "input", inputs: [{ seq: 1, buttons: 16 }] };
    expect(parseClientMessage(JSON.stringify(msg)).ok).toBe(false);
  });

  test("error points at the bad field", () => {
    const result = parseClientMessage(JSON.stringify({ v: 0, type: "chat", text: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/^text:/);
  });

  test("netsim drop is limited to 0.5", () => {
    const msg = { v: 0, type: "netsim", lag: 100, jitter: 30, drop: 0.9 };
    expect(parseClientMessage(JSON.stringify(msg)).ok).toBe(false);
  });
});

describe("server messages", () => {
  test("encodeServerMessage output parses back", () => {
    const text = encodeServerMessage("chat", { from: "p1", name: "Olek", text: "привіт", t: 1 });
    const result = parseServerMessage(text);
    expect(result.ok && result.value.type === "chat" && result.value.text).toBe("привіт");
  });

  test("an unknown server message is an error, not an exception", () => {
    expect(parseServerMessage(JSON.stringify({ v: 0, type: "nope" })).ok).toBe(false);
  });

  test("json codec input is a valid client message", () => {
    const text = codecFor("json").encodeInput([{ seq: seq(5), buttons: 9 }]);
    expect(typeof text === "string" && parseClientMessage(text).ok).toBe(true);
  });
});
