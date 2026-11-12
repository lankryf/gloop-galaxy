import type { Bus } from "@gloop/shared/bus.ts";
import type { PickupType } from "@gloop/shared/sim/pickup.ts";
import type { WorldEvents } from "@gloop/shared/sim/world.ts";
import type { View } from "./render/canvas.ts";

interface Popup {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly big: boolean;
  ttl: number;
}

interface Message {
  readonly text: string;
  ttl: number;
}

export const PICKUP_NAMES: Readonly<Record<PickupType, string>> = {
  shield: "ЩИТ",
  rapid: "ШВИДКИЙ ВОГОНЬ",
  homing: "САМОНАВЕДЕННЯ",
};

export interface Hud {
  note(text: string, seconds?: number): void;
  update(dt: number): void;
  drawWorld(ctx: CanvasRenderingContext2D): void;
  drawScreen(ctx: CanvasRenderingContext2D, view: View): void;
}

export function createHud(bus: Bus<WorldEvents>): Hud {
  let popups: Popup[] = [];
  let messages: Message[] = [];

  bus.on("scored", ({ points, x, y }) => {
    popups.push({ text: `+${points}`, x, y, ttl: 1, big: points >= 100 });
  });
  bus.on("pickup", ({ type, x, y }) => {
    popups.push({ text: PICKUP_NAMES[type], x, y, ttl: 1.4, big: true });
  });
  bus.on("swallowed", ({ kind, x, y }) => {
    if (kind === "ship") popups.push({ text: "НЯМ!", x, y, ttl: 1.4, big: true });
  });

  return {
    note(text, seconds = 5) {
      messages.push({ text, ttl: seconds });
    },
    update(dt) {
      for (const p of popups) p.ttl -= dt;
      for (const m of messages) m.ttl -= dt;
      popups = popups.filter((p) => p.ttl > 0);
      messages = messages.filter((m) => m.ttl > 0);
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
