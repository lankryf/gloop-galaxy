import assert from "node:assert/strict";
import { test } from "vitest";
import { atan2, cos, hypot, sin } from "../sim/fmath.ts";

test("sin and cos are close to Math within 1e-12", () => {
  for (let x = -20; x <= 20; x += 0.0137) {
    assert.ok(Math.abs(sin(x) - Math.sin(x)) < 1e-12, `sin(${x})`);
    assert.ok(Math.abs(cos(x) - Math.cos(x)) < 1e-12, `cos(${x})`);
  }
});

test("atan2 matches Math.atan2 in every quadrant", () => {
  for (let a = -3.14; a <= 3.14; a += 0.01) {
    for (const r of [0.001, 1, 750]) {
      const y = Math.sin(a) * r;
      const x = Math.cos(a) * r;
      assert.ok(Math.abs(atan2(y, x) - Math.atan2(y, x)) < 1e-12, `atan2 at ${a}`);
    }
  }
  assert.equal(atan2(0, 0), 0);
});

test("hypot", () => {
  assert.equal(hypot(3, 4), 5);
});
