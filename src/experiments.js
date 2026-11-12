const params = new URLSearchParams(location.search);

export const experiment = params.get("exp") ?? "";
export const probe = params.has("probe");

export function busyWait(ms) {
  const end = performance.now() + ms;
  let spins = 0;
  while (performance.now() < end) spins++;
  return spins;
}

export function probeControls(simTime) {
  return { thrust: true, left: simTime < 1.5, right: simTime > 3 && simTime < 3.6 };
}
