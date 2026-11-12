import type { z } from "zod";
import type { SoundName } from "../audio.ts";
import { isSoundName } from "../audio.ts";
import type { Manifest, Theme } from "./manifest.ts";
import { ThemeSchema } from "./manifest.ts";
import { HttpError, messageOf, withRetry } from "./retry.ts";

const REQUEST_TIMEOUT = 8000;

export type JobState = "pending" | "ok" | "failed";

export interface JobStatus {
  readonly name: string;
  state: JobState;
  error?: string;
}

export interface Progress {
  readonly done: number;
  readonly total: number;
  readonly status: readonly JobStatus[];
}

export interface Assets {
  readonly sprites: Record<string, ImageBitmap>;
  readonly sounds: Partial<Record<SoundName, AudioBuffer>>;
  readonly arenas: Record<string, Theme>;
  readonly failures: { name: string; error: string }[];
}

export interface Job {
  readonly name: string;
  readonly required: boolean;
  load(signal: AbortSignal): Promise<void>;
}

function logRetry(url: string) {
  return ({ attempt, wait, error }: { attempt: number; wait: number; error: unknown }) =>
    console.warn(
      `retry ${url}: attempt ${attempt} failed (${messageOf(error)}), next in ${Math.round(wait)} ms`,
    );
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchOk(url: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal: requestSignal(signal) });
  if (!response.ok) throw new HttpError(response.status, url);
  return response;
}

export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  { signal }: { signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetchOk(url, signal);
  const text = await response.text();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error: unknown) {
    throw new SyntaxError(`Bad JSON in ${url}: ${messageOf(error)}`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new SyntaxError(`Unexpected data in ${url}: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

export function loadJson<T>(
  url: string,
  schema: z.ZodType<T>,
  { signal }: { signal?: AbortSignal } = {},
): Promise<T> {
  return withRetry(() => fetchJson(url, schema, signal ? { signal } : {}), {
    ...(signal ? { signal } : {}),
    onRetry: logRetry(url),
  });
}

export function loadImage(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  return withRetry(
    async () => {
      const response = await fetchOk(url, signal);
      return createImageBitmap(await response.blob());
    },
    { signal, onRetry: logRetry(url) },
  );
}

export function loadAudio(
  audioContext: BaseAudioContext,
  url: string,
  signal: AbortSignal,
): Promise<AudioBuffer> {
  return withRetry(
    async () => {
      const response = await fetchOk(url, signal);
      return audioContext.decodeAudioData(await response.arrayBuffer());
    },
    { signal, onRetry: logRetry(url) },
  );
}

export function emptyAssets(): Assets {
  return { sprites: {}, sounds: {}, arenas: {}, failures: [] };
}

export function buildJobs(
  manifest: Manifest,
  audioContext: BaseAudioContext,
  assets: Assets,
): Job[] {
  const jobs: Job[] = [];
  for (const [name, sheet] of Object.entries(manifest.sprites)) {
    jobs.push({
      name: `sprites/${name}`,
      required: false,
      load: async (signal) => {
        assets.sprites[name] = await loadImage(sheet.url, signal);
      },
    });
  }
  for (const [name, url] of Object.entries(manifest.sounds)) {
    if (!isSoundName(name)) continue;
    jobs.push({
      name: `sounds/${name}`,
      required: false,
      load: async (signal) => {
        assets.sounds[name] = await loadAudio(audioContext, url, signal);
      },
    });
  }
  for (const [name, url] of Object.entries(manifest.arenas)) {
    jobs.push({
      name: `arenas/${name}`,
      required: true,
      load: async (signal) => {
        assets.arenas[name] = await loadJson(url, ThemeSchema, { signal });
      },
    });
  }
  return jobs;
}

export async function loadAll(
  jobs: readonly Job[],
  assets: Assets,
  {
    onProgress,
    signal,
    sequential = false,
  }: { onProgress?: (progress: Progress) => void; signal?: AbortSignal; sequential?: boolean } = {},
): Promise<Assets> {
  const inner = new AbortController();
  const linked = signal ? AbortSignal.any([signal, inner.signal]) : inner.signal;
  let finished = false;
  const status: JobStatus[] = jobs.map((job) => ({ name: job.name, state: "pending" }));
  const report = (): void => {
    if (finished) return;
    onProgress?.({
      done: status.filter((s) => s.state !== "pending").length,
      total: jobs.length,
      status,
    });
  };
  report();

  const run = async (job: Job, item: JobStatus): Promise<void> => {
    try {
      await job.load(linked);
      item.state = "ok";
    } catch (error: unknown) {
      item.state = "failed";
      item.error = messageOf(error);
      if (job.required || linked.aborted) {
        report();
        finished = true;
        inner.abort(error);
        throw error;
      }
      assets.failures.push({ name: job.name, error: item.error });
    } finally {
      report();
    }
  };

  const pairs = jobs.map((job, i) => ({
    job,
    item: status[i] ?? { name: job.name, state: "pending" },
  }));
  if (sequential) {
    for (const { job, item } of pairs) await run(job, item);
  } else {
    await Promise.all(pairs.map(({ job, item }) => run(job, item)));
  }
  return assets;
}
