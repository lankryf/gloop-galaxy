import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Peer } from "../src/heartbeat.ts";
import { startHeartbeat } from "../src/heartbeat.ts";

function peer(): Peer & { pings: number; dead: boolean } {
  const p = {
    missedPongs: 0,
    pings: 0,
    dead: false,
    socket: {
      ping: () => {
        p.pings += 1;
      },
      terminate: () => {
        p.dead = true;
      },
    },
  };
  return p;
}

describe("heartbeat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("pings every interval", () => {
    const a = peer();
    const stop = startHeartbeat(() => [a], 1000);
    vi.advanceTimersByTime(2500);
    expect(a.pings).toBe(2);
    stop();
  });

  test("a peer that answers is never dropped", () => {
    const a = peer();
    const stop = startHeartbeat(() => [a], 1000);
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(1000);
      a.missedPongs = 0;
    }
    expect(a.dead).toBe(false);
    stop();
  });

  test("a silent peer is terminated on the third tick", () => {
    const a = peer();
    const lost = vi.fn();
    const stop = startHeartbeat(() => [a], 1000, lost);
    vi.advanceTimersByTime(2000);
    expect(a.dead).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(a.dead).toBe(true);
    expect(lost).toHaveBeenCalledWith(a);
    stop();
  });

  test("stop clears the timer", () => {
    const a = peer();
    const stop = startHeartbeat(() => [a], 1000);
    stop();
    vi.advanceTimersByTime(5000);
    expect(a.pings).toBe(0);
  });
});
