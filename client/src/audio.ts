import type { Bus } from "@gloop/shared/bus.ts";
import type { EntityId } from "@gloop/shared/ids.ts";
import type { WorldEvents } from "@gloop/shared/sim/world.ts";

export type SoundName = "shoot" | "hit" | "explosion" | "pickup";

export interface Audio {
  readonly context: AudioContext;
  play(name: SoundName, options?: { volume?: number; rate?: number }): void;
  setBuffers(sounds: Partial<Record<SoundName, AudioBuffer>>): void;
  unlock(): Promise<void>;
  listen(bus: Bus<WorldEvents>, options: { ownId: () => EntityId | null }): void;
}

export function createAudio(): Audio {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.45;
  master.connect(context.destination);
  const buffers = new Map<SoundName, AudioBuffer>();

  function play(name: SoundName, { volume = 1, rate = 1 } = {}): void {
    if (context.state !== "running") return;
    const buffer = buffers.get(name);
    if (!buffer) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(master);
    source.start();
  }

  return {
    context,
    play,
    setBuffers(sounds) {
      for (const [name, buffer] of Object.entries(sounds)) {
        if (isSoundName(name) && buffer) buffers.set(name, buffer);
      }
    },
    unlock() {
      if (context.state === "running") return Promise.resolve();
      return context.resume();
    },
    listen(bus, { ownId }) {
      bus.on("fired", (d) => {
        const own = d.shipId === ownId();
        play("shoot", { volume: own ? 0.5 : 0.2, rate: 0.95 + Math.random() * 0.1 });
      });
      bus.on("hit", () => play("hit", { volume: 0.6 }));
      bus.on("exploded", (d) => play("explosion", { volume: Math.min(1, 0.4 + d.size * 0.3) }));
      bus.on("pickup", () => play("pickup", { volume: 0.7 }));
      bus.on("swallowed", (d) => {
        if (d.kind !== "bullet") play("explosion", { volume: 0.9, rate: 0.45 });
      });
      bus.on("collapsed", () => play("explosion", { volume: 1, rate: 0.3 }));
    },
  };
}

export function isSoundName(name: string): name is SoundName {
  return name === "shoot" || name === "hit" || name === "explosion" || name === "pickup";
}
