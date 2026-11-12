import { HttpError, withRetry } from "./retry.js";

const REQUEST_TIMEOUT = 8000;

function logRetry(url) {
  return ({ attempt, wait, error }) =>
    console.warn(
      `retry ${url}: attempt ${attempt} failed (${error.message}), next in ${Math.round(wait)} ms`,
    );
}

function requestSignal(signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchOk(url, signal) {
  const response = await fetch(url, { signal: requestSignal(signal) });
  if (!response.ok) throw new HttpError(response.status, url);
  return response;
}

export async function fetchJson(url, { signal } = {}) {
  const response = await fetchOk(url, signal);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new SyntaxError(`Bad JSON in ${url}: ${error.message}`);
  }
}

export function loadJson(url, { signal } = {}) {
  return withRetry(() => fetchJson(url, { signal }), { signal, onRetry: logRetry(url) });
}

export function loadImage(url, { signal } = {}) {
  return withRetry(
    async () => {
      const response = await fetchOk(url, signal);
      const blob = await response.blob();
      return createImageBitmap(blob);
    },
    { signal, onRetry: logRetry(url) },
  );
}

export function loadAudio(audioContext, url, { signal } = {}) {
  return withRetry(
    async () => {
      const response = await fetchOk(url, signal);
      const data = await response.arrayBuffer();
      return audioContext.decodeAudioData(data);
    },
    { signal, onRetry: logRetry(url) },
  );
}

export function buildJobs(manifest, audioContext) {
  const jobs = [];
  for (const [name, sheet] of Object.entries(manifest.sprites)) {
    jobs.push({
      group: "sprites",
      name,
      required: false,
      load: (signal) => loadImage(sheet.url, { signal }),
    });
  }
  for (const [name, url] of Object.entries(manifest.sounds)) {
    jobs.push({
      group: "sounds",
      name,
      required: false,
      load: (signal) => loadAudio(audioContext, url, { signal }),
    });
  }
  for (const [name, url] of Object.entries(manifest.arenas)) {
    jobs.push({
      group: "arenas",
      name,
      required: true,
      load: (signal) => loadJson(url, { signal }),
    });
  }
  return jobs;
}

export async function loadAll(jobs, { onProgress, signal, sequential = false } = {}) {
  const inner = new AbortController();
  const linked = signal ? AbortSignal.any([signal, inner.signal]) : inner.signal;
  let finished = false;
  const status = jobs.map((job) => ({ name: `${job.group}/${job.name}`, state: "pending" }));
  const report = () => {
    if (finished) return;
    onProgress?.({
      done: status.filter((s) => s.state !== "pending").length,
      total: jobs.length,
      status,
    });
  };
  report();

  const run = async (job, i) => {
    try {
      const value = await job.load(linked);
      status[i].state = "ok";
      return { job, value };
    } catch (error) {
      status[i].state = "failed";
      status[i].error = error.message;
      if (job.required || linked.aborted) {
        report();
        finished = true;
        inner.abort(error);
        throw error;
      }
      return { job, value: null, error };
    } finally {
      report();
    }
  };

  let results;
  if (sequential) {
    results = [];
    for (let i = 0; i < jobs.length; i++) results.push(await run(jobs[i], i));
  } else {
    results = await Promise.all(jobs.map(run));
  }

  const assets = { sprites: {}, sounds: {}, arenas: {}, failures: [] };
  for (const { job, value, error } of results) {
    if (error) assets.failures.push({ name: `${job.group}/${job.name}`, error: error.message });
    else assets[job.group][job.name] = value;
  }
  return assets;
}
