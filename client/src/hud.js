export function createHud(bus) {
  const popups = [];
  const messages = [];

  bus.addEventListener("scored", (e) => {
    const { points, x, y } = e.detail;
    popups.push({ text: `+${points}`, x, y, ttl: 1, big: points >= 100 });
  });
  bus.addEventListener("pickup", (e) => {
    const names = { shield: "ЩИТ", rapid: "ШВИДКИЙ ВОГОНЬ", homing: "САМОНАВЕДЕННЯ" };
    popups.push({ text: names[e.detail.type], x: e.detail.x, y: e.detail.y, ttl: 1.4, big: true });
  });

  bus.addEventListener("swallowed", (e) => {
    if (e.detail.kind === "ship")
      popups.push({ text: "НЯМ!", x: e.detail.x, y: e.detail.y, ttl: 1.4, big: true });
  });

  return {
    note(text, seconds = 5) {
      messages.push({ text, ttl: seconds });
    },
    update(dt) {
      for (const list of [popups, messages]) {
        for (const p of list) p.ttl -= dt;
        for (let i = list.length - 1; i >= 0; i--) if (list[i].ttl <= 0) list.splice(i, 1);
      }
    },
    drawWorld(ctx) {
      ctx.textAlign = "center";
      for (const p of popups) {
        ctx.globalAlpha = Math.min(1, p.ttl * 2);
        ctx.font = `bold ${p.big ? 30 : 22}px sans-serif`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#1a0b26";
        ctx.fillStyle = "#8dff3a";
        const y = p.y - (1.4 - p.ttl) * 40;
        ctx.strokeText(p.text, p.x, y);
        ctx.fillText(p.text, p.x, y);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "start";
    },
    drawScreen(ctx, view) {
      ctx.font = "14px ui-monospace, Menlo, monospace";
      messages.forEach((m, i) => {
        ctx.fillStyle = "rgba(20, 8, 36, 0.75)";
        const y = view.height - 30 - i * 24;
        ctx.fillRect(10, y - 16, ctx.measureText(m.text).width + 20, 22);
        ctx.fillStyle = "#ffd23f";
        ctx.fillText(m.text, 20, y);
      });
    },
  };
}
