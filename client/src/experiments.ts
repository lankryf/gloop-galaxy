import type { CodecName } from "@gloop/shared/codec/codec.ts";
import type { Controls } from "@gloop/shared/sim/ship.ts";
import type { Manifest } from "./assets/manifest.ts";
import type { Scheduler } from "./loop.ts";

const params = new URLSearchParams(location.search);

export const experiment = params.get("exp") ?? "";
export const probe = params.has("probe");
export const failMode = params.get("fail") ?? "";
export const sequential = params.has("sequential");
export const slow = params.has("slow");
export const offline = params.has("offline") || probe || experiment !== "";

export interface NetOptions {
  codec: CodecName;
  prediction: boolean;
  delayMs: number;
  netgraph: boolean;
  worker: boolean;
}

export const netOptions: Readonly<NetOptions> = {
  codec: params.get("codec") === "json" ? "json" : "binary",
  prediction: params.get("predict") !== "0",
  delayMs: Number(params.get("delay") ?? 100),
  netgraph: params.get("netgraph") !== "0",
  worker: params.has("worker"),
};

export interface GameExperiment {
  readonly name: string;
  readonly probe: boolean;
  readonly controls: ((simTime: number) => Controls) | null;
  readonly scheduler: Scheduler;
  readonly fixedStep: boolean;
  readonly beforeRender: (frame: number) => void;
}

export function busyWait(ms: number): number {
  const end = performance.now() + ms;
  let spins = 0;
  while (performance.now() < end) spins++;
  return spins;
}

export function probeControls(simTime: number): Controls {
  return { thrust: true, left: simTime < 1.5, right: simTime > 3 && simTime < 3.6, fire: false };
}

export function gameExperiment(): GameExperiment {
  return {
    name: experiment,
    probe,
    controls: probe ? probeControls : null,
    scheduler: experiment === "interval" ? "interval" : "raf",
    fixedStep: experiment !== "variable",
    beforeRender: (frame) => {
      if (experiment === "block" && frame % 60 === 0) busyWait(100);
    },
  };
}

function withQuery(url: string, query: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function mapValues(
  record: Record<string, string>,
  fn: (url: string) => string,
): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, url]) => [key, fn(url)]));
}

export function applyFailMode(manifest: Manifest): Manifest {
  let i = 0;
  const delay = (url: string) => (slow ? withQuery(url, `delay=${300 + 60 * i++}`) : url);
  const sprites = Object.fromEntries(
    Object.entries(manifest.sprites).map(([key, sheet]) => [
      key,
      { ...sheet, url: delay(sheet.url) },
    ]),
  );
  const m: Manifest = {
    ...manifest,
    sprites,
    sounds: mapValues(manifest.sounds, delay),
    arenas: mapValues(manifest.arenas, delay),
  };

  const items = m.sprites.items;
  const asteroids = m.sprites.asteroids;
  if (failMode === "404" && items) items.url = "/assets/sprites/missing.png";
  if (failMode === "timeout" && asteroids) asteroids.url = withQuery(asteroids.url, "delay=12000");
  if (failMode === "json" && m.arenas.junkyard)
    m.arenas.junkyard = withQuery(m.arenas.junkyard, "corrupt");
  if (failMode === "flaky" && m.sounds.shoot)
    m.sounds.shoot = withQuery(m.sounds.shoot, `flaky=${Date.now()}`);
  if (failMode === "abort") {
    for (const sheet of Object.values(m.sprites)) sheet.url = withQuery(sheet.url, "delay=3000");
  }
  return m;
}
