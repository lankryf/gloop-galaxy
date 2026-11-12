export function setupCanvas(canvas, world) {
  const ctx = canvas.getContext("2d");
  const view = { scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0, dpr: 1 };

  function resize() {
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

export function beginFrame(ctx, view) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = "#12091f";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
}
