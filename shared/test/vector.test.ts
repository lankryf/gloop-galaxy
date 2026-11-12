import { describe, expect, test } from "vitest";
import { Vector2 } from "../sim/vector.ts";

describe("Vector2", () => {
  test("add and sub return new vectors", () => {
    const a = new Vector2(1, 2);
    const b = a.add({ x: 3, y: 4 });
    expect(b).toEqual(new Vector2(4, 6));
    expect(b.sub(a)).toEqual(new Vector2(3, 4));
    expect(a).toEqual(new Vector2(1, 2));
  });

  test("scale and dot", () => {
    expect(new Vector2(2, -3).scale(2)).toEqual(new Vector2(4, -6));
    expect(new Vector2(1, 2).dot({ x: 3, y: 4 })).toBe(11);
  });

  test("length of a 3-4-5 triangle", () => {
    expect(new Vector2(3, 4).length()).toBeCloseTo(5, 12);
  });

  test("normalize gives unit length and keeps the zero vector at zero", () => {
    expect(new Vector2(10, 0).normalize()).toEqual(new Vector2(1, 0));
    expect(new Vector2(3, 4).normalize().length()).toBeCloseTo(1, 12);
    expect(new Vector2().normalize()).toEqual(new Vector2(0, 0));
  });

  test("rotate by 90 degrees", () => {
    const r = new Vector2(1, 0).rotate(Math.PI / 2);
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);
  });

  test("fromAngle and angle are inverse", () => {
    for (const a of [-3, -1.2, 0, 0.5, 2.9]) {
      expect(Vector2.fromAngle(a, 7).angle()).toBeCloseTo(a, 12);
      expect(Vector2.fromAngle(a, 7).length()).toBeCloseTo(7, 12);
    }
  });
});
