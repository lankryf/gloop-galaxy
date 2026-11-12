import { describe, expect, test } from "vitest";
import { Pool, removeWhere } from "../pool.ts";

describe("Pool", () => {
  test("reuses released objects instead of creating new ones", () => {
    const pool = new Pool(() => ({ n: 0 }));
    const a = pool.acquire();
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    expect(pool.created).toBe(1);
  });

  test("prefill creates objects up front", () => {
    const pool = new Pool(() => ({}), 5);
    expect(pool.available).toBe(5);
    for (let i = 0; i < 5; i++) pool.acquire();
    expect(pool.created).toBe(5);
    pool.acquire();
    expect(pool.created).toBe(6);
  });
});

describe("removeWhere", () => {
  test("removes in place and keeps order", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const same = items;
    const removed: number[] = [];
    removeWhere(
      items,
      (n) => n % 2 === 0,
      (n) => removed.push(n),
    );
    expect(items).toBe(same);
    expect(items).toEqual([1, 3, 5]);
    expect(removed).toEqual([2, 4, 6]);
  });

  test("handles empty and all-removed arrays", () => {
    const empty: number[] = [];
    removeWhere(empty, () => true);
    expect(empty).toEqual([]);
    const all = [1, 2];
    removeWhere(all, () => true);
    expect(all).toEqual([]);
  });
});
