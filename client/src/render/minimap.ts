import type { ArenaSize } from "@gloop/shared/sim/arena.ts";
import type { Camera } from "./camera.ts";
import type { View } from "./canvas.ts";

export const MINIMAP = { width: 224, height: 126, margin: 12 };

export interface MinimapDot {
  readonly x: number;
  readonly y: number;
}

export class Minimap {
  readonly arena: ArenaSize;
  left = 0;
  top = 0;
  #sx = 1;
  #sy = 1;

  constructor(arena: ArenaSize) {
    this.arena = arena;
  }

  begin(ctx: CanvasRenderingContext2D, view: View): void {
    const { width, height, margin } = MINIMAP;
    this.left = Math.round((view.width - width) / 2);
    this.top = Math.round(view.height - height - margin);
    this.#sx = width / this.arena.width;
    this.#sy = height / this.arena.height;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = "rgba(20, 8, 36, 0.92)";
    ctx.fillRect(this.left, this.top, width, height);
    ctx.strokeStyle = "rgba(141, 255, 58, 0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.left, this.top, width, height);
  }

  dot(ctx: CanvasRenderingContext2D, p: MinimapDot, radius: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(this.left + p.x * this.#sx, this.top + p.y * this.#sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ring(ctx: CanvasRenderingContext2D, p: MinimapDot, worldRadius: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(
      this.left + p.x * this.#sx,
      this.top + p.y * this.#sy,
      worldRadius * this.#sx,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }

  viewport(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const { width, height } = MINIMAP;
    const w = camera.halfW * 2 * this.#sx;
    const h = camera.halfH * 2 * this.#sy;
    const x = this.left + (camera.x - camera.halfW) * this.#sx;
    const y = this.top + (camera.y - camera.halfH) * this.#sy;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.left, this.top, width, height);
    ctx.clip();
    ctx.strokeStyle = "rgba(244, 233, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
}
