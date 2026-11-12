const PRESETS = [
  { lag: 0, jitter: 0, drop: 0 },
  { lag: 100, jitter: 0, drop: 0 },
  { lag: 100, jitter: 30, drop: 0.02 },
  { lag: 250, jitter: 50, drop: 0.05 },
];

export function createNetgraph() {
  const stats = {
    rtt: 0,
    snapshotAge: 0,
    bytesInPerSec: 0,
    bytesOutPerSec: 0,
    snapshotBytes: 0,
    pending: 0,
    correction: 0,
    maxCorrection: 0,
    delayMs: 100,
    codec: "binary",
    prediction: true,
    netsim: { lag: 0, jitter: 0, drop: 0 },
    history: [],
  };
  let presetIndex = 0;

  return {
    stats,
    nextPreset() {
      presetIndex = (presetIndex + 1) % PRESETS.length;
      return PRESETS[presetIndex];
    },
    draw(ctx, view) {
      const w = 250;
      const lines = [
        `RTT        ${stats.rtt.toFixed(0)} ms`,
        `snap age   ${stats.snapshotAge.toFixed(0)} ms`,
        `down       ${(stats.bytesInPerSec / 1024).toFixed(1)} KB/s`,
        `up         ${(stats.bytesOutPerSec / 1024).toFixed(2)} KB/s`,
        `snapshot   ${stats.snapshotBytes} B (${stats.codec})`,
        `pending    ${stats.pending}`,
        `correction ${stats.correction.toFixed(2)} px (max ${stats.maxCorrection.toFixed(1)})`,
        `interp     ${stats.delayMs} ms  [ ]`,
        `predict    ${stats.prediction ? "on" : "off"}`,
        `netsim     ${stats.netsim.lag}±${stats.netsim.jitter} ms, ${Math.round(stats.netsim.drop * 100)}% F2`,
      ];
      const h = 30 + lines.length * 17 + 46;
      const x = view.width - w - 10;
      const y = view.height - h - 10;
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.fillStyle = "rgba(20, 8, 36, 0.78)";
      ctx.fillRect(x, y, w, h);
      ctx.font = "12px ui-monospace, Menlo, monospace";
      ctx.fillStyle = "#8dff3a";
      lines.forEach((line, i) => {
        ctx.fillText(line, x + 10, y + 20 + i * 17);
      });

      const gx = x + 10;
      const gy = y + h - 12;
      const gh = 36;
      ctx.strokeStyle = "rgba(244, 233, 255, 0.25)";
      ctx.strokeRect(gx, gy - gh, w - 20, gh);
      ctx.strokeStyle = "#ffd23f";
      ctx.beginPath();
      const scale = gh / Math.max(5, ...stats.history);
      stats.history.forEach((v, i) => {
        const px = gx + (i / 119) * (w - 20);
        const py = gy - Math.min(gh, v * scale);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    },
  };
}
