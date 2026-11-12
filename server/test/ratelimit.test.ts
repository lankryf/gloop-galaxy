import assert from "node:assert/strict";
import { test } from "vitest";
import { TokenBucket } from "../src/ratelimit.ts";

test("token bucket allows a burst and then refills over time", () => {
  let now = 0;
  const bucket = new TokenBucket({ ratePerSecond: 10, burst: 3, now: () => now });
  assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), false);
  now += 100;
  assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), false);
  now += 10_000;
  for (let i = 0; i < 3; i++) assert.equal(bucket.take(), true);
  assert.equal(bucket.take(), false);
});
