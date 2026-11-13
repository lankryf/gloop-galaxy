import type { ArenaSize } from "@gloop/shared/sim/arena.ts";
import type { View } from "./canvas.ts";

const DASH = [28, 18];
const SOLID: number[] = [];

export const VIEWPORT: ArenaSize = { width: 1600, height: 900 };

export class Camera {
  readonly arena: ArenaSize;
  x: number;
  y: number;
  halfW = VIEWPORT.width / 2;
  halfH = VIEWPORT.height / 2;

  constructor(arena: ArenaSize) {
    this.arena = arena;
    this.x = arena.width / 2;
    this.y = arena.height / 2;
  }

  follow(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  begin(ctx: CanvasRenderingContext2D, view: View): void {
    this.halfW = view.width / view.scale / 2;
    this.halfH = view.height / view.scale / 2;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = "#12091f";
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.translate(view.width / 2, view.height / 2);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-this.x, -this.y);
  }

  place(x: number, y: number, margin = 120): boolean {
    return (
      Math.abs(x - this.x) <= this.halfW + margin && Math.abs(y - this.y) <= this.halfH + margin
    );
  }

  border(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = "rgba(141, 255, 58, 0.6)";
    ctx.lineWidth = 6;
    ctx.setLineDash(DASH);
    ctx.strokeRect(0, 0, this.arena.width, this.arena.height);
    ctx.setLineDash(SOLID);
  }
}
