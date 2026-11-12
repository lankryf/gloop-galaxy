export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      reject(signal.reason);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryable(error) {
  if (error.name === "AbortError" || error.name === "TimeoutError") return false;
  if (error instanceof HttpError) return error.status >= 500;
  if (error instanceof SyntaxError) return false;
  return true;
}

export async function withRetry(
  fn,
  { attempts = 4, baseMs = 200, maxMs = 3000, signal, onRetry } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (signal?.aborted || !isRetryable(error) || attempt === attempts) throw error;
      const cap = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const wait = Math.random() * cap;
      onRetry?.({ attempt, wait, error });
      await sleep(wait, signal);
    }
  }
  throw lastError;
}
