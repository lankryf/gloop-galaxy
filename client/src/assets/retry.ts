export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(id);
      reject(signal?.reason);
    };
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status >= 500;
  return error instanceof TypeError;
}

export interface RetryInfo {
  readonly attempt: number;
  readonly wait: number;
  readonly error: unknown;
}

export interface RetryOptions {
  readonly attempts?: number;
  readonly baseMs?: number;
  readonly maxMs?: number;
  readonly signal?: AbortSignal;
  readonly onRetry?: (info: RetryInfo) => void;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  { attempts = 4, baseMs = 200, maxMs = 3000, signal, onRetry }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error: unknown) {
      if (signal?.aborted || !isRetryable(error) || attempt >= attempts) throw error;
      const cap = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const wait = Math.random() * cap;
      onRetry?.({ attempt, wait, error });
      await sleep(wait, signal);
    }
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
