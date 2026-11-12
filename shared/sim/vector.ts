import { atan2, cos, hypot, sin } from "./fmath.ts";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export class Vector2 implements Point {
  readonly x: number;
  readonly y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  static fromAngle(angle: number, length = 1): Vector2 {
    return new Vector2(cos(angle) * length, sin(angle) * length);
  }

  add(v: Point): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v: Point): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  scale(k: number): Vector2 {
    return new Vector2(this.x * k, this.y * k);
  }

  dot(v: Point): number {
    return this.x * v.x + this.y * v.y;
  }

  length(): number {
    return hypot(this.x, this.y);
  }

  normalize(): Vector2 {
    const len = this.length();
    return len === 0 ? new Vector2() : new Vector2(this.x / len, this.y / len);
  }

  rotate(angle: number): Vector2 {
    const c = cos(angle);
    const s = sin(angle);
    return new Vector2(this.x * c - this.y * s, this.x * s + this.y * c);
  }

  angle(): number {
    return atan2(this.y, this.x);
  }
}
