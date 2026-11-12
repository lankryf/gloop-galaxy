import { randomBytes } from "node:crypto";
import { encodeInput } from "@gloop/shared/codec/binary.ts";
import { seq } from "@gloop/shared/ids.ts";
import { WebSocket } from "ws";
import { z } from "zod";

const base = process.env.TARGET ?? "http://127.0.0.1:8080";
const wsUrl = `${base.replace(/^http/, "ws")}/ws`;
const seconds = Number(process.argv[2] ?? 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const StatsSchema = z.object({
  matches: z.array(
    z.object({
      room: z.string(),
      tickMs: z.object({ p50: z.number(), p99: z.number() }),
      intervalMs: z.object({ mean: z.number(), jitter: z.number() }),
    }),
  ),
  eventLoop: z.object({ utilization: z.number() }),
});

async function roomStats(roomId: string) {
  const s = StatsSchema.parse(await (await fetch(`${base}/api/stats`)).json());
  const m = s.matches.find((x) => x.room === roomId);
  return {
    tickP50: m?.tickMs.p50,
    tickP99: m?.tickMs.p99,
    interval: m?.intervalMs.mean,
    elu: s.eventLoop.utilization,
  };
}

async function rejected(reason: string): Promise<number> {
  const text = await (await fetch(`${base}/metrics`)).text();
  const line = text
    .split("\n")
    .find((l) => l.startsWith(`gloop_rejections_total{reason="${reason}"}`));
  return Number(line?.split(" ")[1] ?? 0);
}

async function createRoom(name: string): Promise<string> {
  const res = await fetch(`${base}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arena: "nebula" }),
  });
  return z.object({ id: z.string() }).parse(await res.json()).id;
}

function player(roomId: string, name: string): () => void {
  const socket = new WebSocket(wsUrl);
  let n = 0;
  let timer: NodeJS.Timeout | null = null;
  socket.on("open", () => {
    socket.send(JSON.stringify({ v: 0, type: "join", room: roomId, name, codec: "binary" }));
    timer = setInterval(() => {
      n += 1;
      socket.send(encodeInput([{ seq: seq(n), buttons: Math.floor(Math.random() * 16) }]));
    }, 1000 / 30);
  });
  return () => {
    if (timer) clearInterval(timer);
    socket.close();
  };
}

function flooder(stats: { sent: number; closed: number; codes: Map<number, number> }): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const open = () => {
    if (stopped) return;
    const socket = new WebSocket(wsUrl);
    socket.on("error", () => {});
    socket.on("open", () => {
      timer = setInterval(() => {
        for (let i = 0; i < 10; i++) {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(randomBytes(1 + Math.floor(Math.random() * 64)));
          stats.sent += 1;
        }
      }, 10);
    });
    socket.on("close", (code: number) => {
      if (timer) clearInterval(timer);
      stats.closed += 1;
      stats.codes.set(code, (stats.codes.get(code) ?? 0) + 1);
      setTimeout(open, 5);
    });
  };
  open();
  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}

const roomA = await createRoom("chaos A");
const players = Array.from({ length: 8 }, (_, i) => player(roomA, `calm${i}`));
await sleep(3000);
await roomStats(roomA);
await sleep(seconds * 1000);
const before = await roomStats(roomA);
const rejectedBefore = await rejected("bad_message");

const flood = { sent: 0, closed: 0, codes: new Map<number, number>() };
const stopFlood = flooder(flood);
await sleep(seconds * 1000);
const during = await roomStats(roomA);
stopFlood();
const rejectedAfter = await rejected("bad_message");
for (const stop of players) stop();

console.log(
  JSON.stringify(
    {
      seconds,
      before,
      during,
      flood: {
        sent: flood.sent,
        perSecond: Math.round(flood.sent / seconds),
        closed: flood.closed,
        codes: Object.fromEntries(flood.codes),
      },
      badMessageRejections: rejectedAfter - rejectedBefore,
    },
    null,
    2,
  ),
);
process.exit(0);
