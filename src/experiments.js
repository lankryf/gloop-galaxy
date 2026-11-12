const params = new URLSearchParams(location.search);

export const experiment = params.get("exp") ?? "";
export const probe = params.has("probe");
export const failMode = params.get("fail") ?? "";
export const sequential = params.has("sequential");
export const slow = params.has("slow");

export function busyWait(ms) {
  const end = performance.now() + ms;
  let spins = 0;
  while (performance.now() < end) spins++;
  return spins;
}

export function probeControls(simTime) {
  return {
    thrust: true,
    left: simTime < 1.5,
    right: simTime > 3 && simTime < 3.6,
    fire: false,
  };
}

export function gameExperiment() {
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

function withQuery(url, query) {
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

export function applyFailMode(manifest) {
  const m = structuredClone(manifest);
  if (slow) {
    let i = 0;
    for (const sheet of Object.values(m.sprites))
      sheet.url = withQuery(sheet.url, `delay=${300 + 60 * i++}`);
    for (const key of Object.keys(m.sounds))
      m.sounds[key] = withQuery(m.sounds[key], `delay=${300 + 60 * i++}`);
    for (const key of Object.keys(m.arenas))
      m.arenas[key] = withQuery(m.arenas[key], `delay=${300 + 60 * i++}`);
  }
  if (failMode === "404") m.sprites.items.url = "/assets/sprites/missing.png";
  if (failMode === "timeout")
    m.sprites.asteroids.url = withQuery(m.sprites.asteroids.url, "delay=12000");
  if (failMode === "json") m.arenas.junkyard = withQuery(m.arenas.junkyard, "corrupt");
  if (failMode === "flaky") m.sounds.shoot = withQuery(m.sounds.shoot, "flaky");
  if (failMode === "abort") {
    for (const sheet of Object.values(m.sprites)) sheet.url = withQuery(sheet.url, "delay=3000");
  }
  return m;
}
