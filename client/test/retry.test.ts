import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HttpError, messageOf, sleep, withRetry } from "../src/assets/retry.ts";

describe("withRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("retries 5xx and then succeeds", async () => {
    let calls = 0;
    const promise = withRetry(async () => {
      calls += 1;
      if (calls < 3) throw new HttpError(503, "/x");
      return "ok";
    });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(calls).toBe(3);
  });

  test("does not retry 404", async () => {
    const fn = vi.fn(async () => {
      throw new HttpError(404, "/x");
    });
    await expect(withRetry(fn)).rejects.toThrow("HTTP 404");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("gives up after the last attempt", async () => {
    const fn = vi.fn(async () => {
      throw new TypeError("network");
    });
    const promise = withRetry(fn, { attempts: 3 });
    const check = expect(promise).rejects.toThrow("network");
    await vi.runAllTimersAsync();
    await check;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("sleep rejects as soon as the signal aborts", async () => {
    const controller = new AbortController();
    const promise = sleep(10_000, controller.signal);
    controller.abort(new Error("stop"));
    await expect(promise).rejects.toThrow("stop");
  });

  test("messageOf handles non-errors", () => {
    expect(messageOf(new Error("a"))).toBe("a");
    expect(messageOf("b")).toBe("b");
  });
});
