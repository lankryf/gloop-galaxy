import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MESSAGE_BYTES, parseClientMessage } from "../src/protocol.js";

const ok = (msg) => parseClientMessage(JSON.stringify(msg));

test("accepts a valid join", () => {
  const { msg, error } = ok({ v: 0, type: "join", room: "room-1", name: "Olek" });
  assert.equal(error, undefined);
  assert.equal(msg.type, "join");
});

test("rejects unknown type, wrong version and bad shapes", () => {
  assert.match(ok({ v: 0, type: "teleport" }).error, /unknown message type/);
  assert.match(ok({ v: 1, type: "chat", text: "hi" }).error, /version/);
  assert.match(ok({ v: 0, type: "chat", text: "" }).error, /chat/);
  assert.match(ok({ v: 0, type: "join", room: "r", name: "<script>" }).error, /name/);
  assert.match(parseClientMessage("[1,2]").error, /object/);
  assert.match(parseClientMessage("{oops").error, /invalid JSON/);
});

test("does not treat prototype keys as message types", () => {
  assert.match(ok({ v: 0, type: "constructor" }).error, /unknown message type/);
  assert.match(ok({ v: 0, type: "__proto__" }).error, /unknown message type/);
});

test("rejects oversized messages before parsing", () => {
  const big = JSON.stringify({ v: 0, type: "chat", text: "x".repeat(MAX_MESSAGE_BYTES) });
  assert.equal(parseClientMessage(big).error, "message too large");
});
