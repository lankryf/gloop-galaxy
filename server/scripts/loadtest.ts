import { encodeInput } from "@gloop/shared/codec/binary.ts";
import { seq } from "@gloop/shared/ids.ts";
import { WebSocket } from "ws";
import { z } from "zod";

const base = process.env.TARGET ?? "http://127.0.0.1:8080";
const counts = (process.argv[2] ?? "8,32,64,128").split(",").map(Number);
const seconds = Number(process.argv[3] ?? 20);
const perRoom = Number(process.argv[4] ?? 8);

const StatsSchema = z.object({
  matches: z.array(
    z.object({
      room: z.string(),
      entities: z.number(),
      tickMs: z.object({ p50: z.number(), p99: z.number() }),
    }),
  ),
  memory: z.number(),
  eventLoop: z.object({ utilization: z.number() }),
  cpu: z.number(),
});
type Stats = z.infer<typeof StatsSchema>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function stats(): Promise<Stats> {
  const res = await fetch(`${base}/api/stats`);
  return StatsSchema.parse(await res.json());
}

async function createRoom(i: number): Promise<string> {
  const res = await fetch(`${base}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `load ${i}`, arena: i % 2 ? "junkyard" : "nebula" }),
  });
  return z.object({ id: z.string() }).parse(await res.json()).id;
}

interface Client {
  socket: WebSocket;
  bytes: number;
  timer: NodeJS.Timeout | null;
}

function connect(roomId: string, name: string): Promise<Client> {
  const url = `${base.replace(/^http/, "ws")}/ws`;
  const client: Client = { socket: new WebSocket(url), bytes: 0, timer: null };
  return new Promise((resolve, reject) => {
    client.socket.on("error", reject);
    client.socket.on("open", () => {
      client.socket.send(
        JSON.stringify({ v: 0, type: "join", room: roomId, name, codec: "binary" }),
      );
    });
    client.socket.on("message", (data: Buffer, isBinary: boolean) => {
      client.bytes += data.byteLength;
      if (!isBinary && client.timer === null && data.toString().includes('"welcome"')) {
        let n = 0;
        client.timer = setInterval(() => {
          n += 1;
          const buttons = Math.floor(Math.random() * 16);
          client.socket.send(encodeInput([{ seq: seq(n), buttons }]));
        }, 1000 / 30);
        resolve(client);
      }
    });
  });
}

async function run(count: number) {
  const rooms: string[] = [];
  for (let i = 0; i < Math.ceil(count / perRoom); i++) rooms.push(await createRoom(i));
  const clients: Client[] = [];
  for (let i = 0; i < count; i++) {
    const room = rooms[Math.floor(i / perRoom)] ?? "";
    clients.push(await connect(room, `load${i}`));
  }
  await sleep(3000);
  await stats();
  for (const c of clients) c.bytes = 0;
  await sleep(seconds * 1000);
  const s = await stats();
  const bytes = clients.reduce((sum, c) => sum + c.bytes, 0);
  const p99 = Math.max(...s.matches.map((m) => m.tickMs.p99));
  const p50 = Math.max(...s.matches.map((m) => m.tickMs.p50));
  const result = {
    clients: count,
    rooms: rooms.length,
    entities: Math.max(...s.matches.map((m) => m.entities)),
    tickP50: p50,
    tickP99: p99,
    elu: s.eventLoop.utilization,
    cpu: s.cpu,
    rssMB: Math.round(s.memory / 1024 / 1024),
    outKBs: Math.round(bytes / seconds / 1024),
  };
  for (const c of clients) {
    if (c.timer) clearInterval(c.timer);
    c.socket.close();
  }
  await sleep(2000);
  return result;
}

const results = [];
for (const count of counts) {
  const r = await run(count);
  console.log(JSON.stringify(r));
  results.push(r);
}
console.table(results);
