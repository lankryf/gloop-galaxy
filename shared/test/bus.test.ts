import { describe, expect, test, vi } from "vitest";
import { Bus } from "../bus.ts";
import { entityId, isEntityId, isSeq, isTick, seq, tick } from "../ids.ts";
import { fail, ok } from "../result.ts";

type Events = { ping: { n: number }; pong: null };

describe("Bus", () => {
  test("emit calls handlers in order with the payload", () => {
    const bus = new Bus<Events>();
    const calls: number[] = [];
    bus.on("ping", ({ n }) => calls.push(n));
    bus.on("ping", ({ n }) => calls.push(n * 10));
    bus.emit("ping", { n: 2 });
    expect(calls).toEqual([2, 20]);
  });

  test("the returned function unsubscribes", () => {
    const bus = new Bus<Events>();
    const handler = vi.fn();
    const off = bus.on("pong", handler);
    off();
    bus.emit("pong", null);
    expect(handler).not.toHaveBeenCalled();
  });

  test("once fires a single time", () => {
    const bus = new Bus<Events>();
    const handler = vi.fn();
    bus.once("pong", handler);
    bus.emit("pong", null);
    bus.emit("pong", null);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("an aborted signal removes the handler", () => {
    const bus = new Bus<Events>();
    const handler = vi.fn();
    const controller = new AbortController();
    bus.on("pong", handler, { signal: controller.signal });
    controller.abort();
    bus.emit("pong", null);
    expect(handler).not.toHaveBeenCalled();
  });

  test("unsubscribing inside a handler does not skip the next one", () => {
    const bus = new Bus<Events>();
    const second = vi.fn();
    const off = bus.on("pong", () => off());
    bus.on("pong", second);
    bus.emit("pong", null);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("ids", () => {
  test("entity ids are 1..65535", () => {
    expect(isEntityId(0)).toBe(false);
    expect(isEntityId(1)).toBe(true);
    expect(isEntityId(0xffff)).toBe(true);
    expect(isEntityId(0x10000)).toBe(false);
    expect(isEntityId(1.5)).toBe(false);
    expect(() => entityId(-1)).toThrow(RangeError);
  });

  test("ticks and seqs are uint32", () => {
    expect(isTick(0)).toBe(true);
    expect(isSeq(0xffffffff)).toBe(true);
    expect(() => tick(2 ** 32)).toThrow(RangeError);
    expect(() => seq(-1)).toThrow(RangeError);
  });

  test("result helpers", () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 });
    expect(fail("nope")).toEqual({ ok: false, error: "nope" });
  });
});
