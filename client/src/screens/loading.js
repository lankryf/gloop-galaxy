const ICONS = { pending: "…", ok: "✓", failed: "✗" };

export function drawLoading(ctx, view, progress, title = "Завантаження", detail = "") {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = "#12091f";
  ctx.fillRect(0, 0, view.width, view.height);

  const w = Math.min(520, view.width - 40);
  const x = (view.width - w) / 2;
  const y = view.height / 2 - 120;
  const share = progress.total ? progress.done / progress.total : 0;

  ctx.fillStyle = "#8dff3a";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(title, x, y);

  ctx.strokeStyle = "#8dff3a";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y + 16, w, 26);
  ctx.fillRect(x + 4, y + 20, (w - 8) * share, 18);

  ctx.font = "14px ui-monospace, Menlo, monospace";
  if (detail) {
    ctx.fillStyle = "#ff5c5c";
    ctx.fillText(detail.slice(0, 80), x, y + 290);
  }
  ctx.fillStyle = "#f4e9ff";
  ctx.fillText(`${progress.done} / ${progress.total}  ${Math.round(share * 100)}%`, x, y + 66);

  progress.status.forEach((item, i) => {
    ctx.fillStyle =
      item.state === "failed" ? "#ff5c5c" : item.state === "ok" ? "#8dff3a" : "#b49ad1";
    const line = `${ICONS[item.state]} ${item.name}${item.error ? ` – ${item.error}` : ""}`;
    ctx.fillText(line.slice(0, 70), x, y + 96 + i * 20);
  });
}
