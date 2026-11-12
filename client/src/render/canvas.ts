import type { ArenaSize } from "@gloop/shared/sim/arena.ts";

export interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  dpr: number;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not supported");
  return ctx;
}

export function setupCanvas(
  canvas: HTMLCanvasElement,
  world: ArenaSize,
): { ctx: CanvasRenderingContext2D; view: View } {
  const ctx = context2d(canvas);
  const view: View = { scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0, dpr: 1 };

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const scale = Math.min(width / world.width, height / world.height);
    view.dpr = dpr;
    view.width = width;
    view.height = height;
    view.scale = scale;
    view.offsetX = (width - world.width * scale) / 2;
    view.offsetY = (height - world.height * scale) / 2;
  }

  resize();
  window.addEventListener("resize", resize);

  return { ctx, view };
}

export function beginFrame(ctx: CanvasRenderingContext2D, view: View): void {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = "#12091f";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
}
