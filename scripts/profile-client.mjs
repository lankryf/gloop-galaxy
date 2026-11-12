import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [
  label = "before",
  secs = "30",
  bots = "8",
  outDir = "docs/perf",
  base = "http://localhost:5173",
] = process.argv.slice(2);
const api = process.env.API ?? "http://localhost:8080";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(query, fn) {
  const b = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on("pageerror", (e) => console.log("pageerror", e.message));
  await p.goto(`${base}/${query}`);
  await sleep(1500);
  await p.evaluate(() => {
    document.querySelector('input[name="pilot"]').value = "Olek";
    document.querySelectorAll(".rooms li")[0].click();
    document.querySelector(".join").click();
  });
  await sleep(800);
  const rooms = await (await fetch(`${api}/api/rooms`)).json();
  const room = rooms.find((r) => r.players > 0) ?? rooms[0];
  if (+bots > 0)
    await fetch(`${api}/api/rooms/${room.id}/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: +bots }),
    });
  await sleep(1500);
  await p.evaluate(() => {
    window.gloop.loop.frames.reset();
  });
  await p.keyboard.down("Space");
  await p.keyboard.down("ArrowUp");
  await p.keyboard.down("ArrowLeft");
  const cdp = await p.context().newCDPSession(p);
  const result = await fn(p, cdp);
  await b.close();
  return result;
}

const plain = await session("", async (p, cdp) => {
  const events = [];
  cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,v8,disabled-by-default-v8.gc",
    transferMode: "ReportEvents",
  });
  await sleep(+secs * 1000);
  const frames = await p.evaluate(() => window.gloop.loop.frames.percentiles());
  await cdp.send("Tracing.end");
  await done;
  const gc = {};
  for (const e of events) {
    if (
      !["MinorGC", "MajorGC", "V8.GC_MC_BACKGROUND_MARKING"].includes(e.name) &&
      !e.name.startsWith("V8.GCFinalizeMC")
    )
      continue;
    if (e.ph !== "X") continue;
    gc[e.name] ??= { count: 0, ms: 0 };
    gc[e.name].count += 1;
    gc[e.name].ms += (e.dur ?? 0) / 1000;
  }
  return { frames, gc };
});

const profiled = await session("?marks", async (p, cdp) => {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.startSampling", {
    samplingInterval: 4096,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  await cdp.send("Profiler.start");
  await sleep(+secs * 1000);
  const { profile } = await cdp.send("Profiler.stop");
  const { profile: heap } = await cdp.send("HeapProfiler.stopSampling");
  const marks = await p.evaluate(() => window.gloop.measures());
  writeFileSync(`${outDir}/${label}.cpuprofile`, JSON.stringify(profile));
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    const k = `${n.callFrame.functionName || "(anonymous)"} ${n.callFrame.url.split("?")[0].split("/").slice(-2).join("/")}:${n.callFrame.lineNumber + 1}`;
    self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const topSelf = [...self]
    .filter(([k]) => !k.startsWith("(idle)") && !k.startsWith("(program)"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, ms]) => [k, +ms.toFixed(0), +((100 * ms) / total).toFixed(1)]);
  const alloc = new Map();
  const walk = (n) => {
    const k = `${n.callFrame.functionName || "(anonymous)"} ${n.callFrame.url.split("?")[0].split("/").slice(-2).join("/")}:${n.callFrame.lineNumber + 1}`;
    alloc.set(k, (alloc.get(k) ?? 0) + n.selfSize);
    n.children.forEach(walk);
  };
  walk(heap.head);
  const totalAlloc = [...alloc.values()].reduce((a, b) => a + b, 0);
  const topAlloc = [...alloc]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, bytes]) => [k, +(bytes / 1024).toFixed(0), +((100 * bytes) / totalAlloc).toFixed(1)]);
  return { marks, topSelf, topAlloc, totalAllocKB: +(totalAlloc / 1024).toFixed(0) };
});

const result = { label, ...plain, ...profiled };
writeFileSync(`${outDir}/${label}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 1));
