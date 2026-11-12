export function createAudio() {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.45;
  master.connect(context.destination);
  const buffers = new Map();

  function play(name, { volume = 1, rate = 1 } = {}) {
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
    setBuffers(sounds) {
      for (const [name, buffer] of Object.entries(sounds)) buffers.set(name, buffer);
    },
    unlock() {
      if (context.state === "running") return Promise.resolve();
      return context.resume();
    },
    listen(bus, { ownId }) {
      bus.addEventListener("fired", (e) => {
        const own = e.detail.shipId === ownId();
        play("shoot", { volume: own ? 0.5 : 0.2, rate: 0.95 + Math.random() * 0.1 });
      });
      bus.addEventListener("hit", () => play("hit", { volume: 0.6 }));
      bus.addEventListener("exploded", (e) =>
        play("explosion", { volume: Math.min(1, 0.4 + e.detail.size * 0.3) }),
      );
      bus.addEventListener("pickup", () => play("pickup", { volume: 0.7 }));
    },
  };
}
