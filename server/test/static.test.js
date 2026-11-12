import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { resolveStatic } from "../src/http.js";

const root = path.resolve("/srv/dist");

test("serves files inside the root", () => {
  assert.equal(resolveStatic(root, "/"), path.join(root, "index.html"));
  assert.equal(resolveStatic(root, "/assets/a.png"), path.join(root, "assets/a.png"));
});

test("blocks path traversal", () => {
  assert.equal(resolveStatic(root, "/../etc/passwd"), null);
  assert.equal(resolveStatic(root, "/%2e%2e/%2e%2e/etc/passwd"), null);
  assert.equal(resolveStatic(root, "/a/..%2f..%2fsecret"), null);
  assert.equal(resolveStatic(root, "/%00"), null);
  assert.equal(resolveStatic(root, "/%E0%A4%A"), null);
});
