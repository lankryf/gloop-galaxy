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
    this.left = Math.round(view.width - width - margin);
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
    const { width, height } = MINIMAP;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.left, this.top, width, height);
    ctx.clip();
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
    ctx.restore();
  }

  target(ctx: CanvasRenderingContext2D, from: MinimapDot, to: MinimapDot, time: number): void {
    const { width, height } = MINIMAP;
    const fx = this.left + from.x * this.#sx;
    const fy = this.top + from.y * this.#sy;
    const tx = this.left + Math.max(0, Math.min(this.arena.width, to.x)) * this.#sx;
    const ty = this.top + Math.max(0, Math.min(this.arena.height, to.y)) * this.#sy;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.left, this.top, width, height);
    ctx.clip();
    ctx.strokeStyle = "rgba(120, 220, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, 4 + Math.sin(time / 120), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  course(ctx: CanvasRenderingContext2D, from: MinimapDot, to: MinimapDot, color: string): void {
    const { width, height } = MINIMAP;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.left, this.top, width, height);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(this.left + from.x * this.#sx, this.top + from.y * this.#sy);
    ctx.lineTo(this.left + to.x * this.#sx, this.top + to.y * this.#sy);
    ctx.stroke();
    ctx.restore();
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
