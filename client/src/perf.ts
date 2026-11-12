const params = new URLSearchParams(globalThis.location?.search ?? "");
const marksOn = params.has("marks");

export interface Percentiles {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export class Samples {
  readonly #values: Float64Array;
  #count = 0;

  constructor(capacity = 8192) {
    this.#values = new Float64Array(capacity);
  }

  push(value: number): void {
    this.#values[this.#count % this.#values.length] = value;
    this.#count += 1;
  }

  reset(): void {
    this.#count = 0;
  }

  percentiles(): Percentiles {
    const n = Math.min(this.#count, this.#values.length);
    const sorted = this.#values.slice(0, n).sort();
    const at = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))] ?? 0;
    return {
      count: n,
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
      max: n > 0 ? (sorted[n - 1] ?? 0) : 0,
    };
  }
}

export function measure<T>(name: string, fn: () => T): T {
  if (!marksOn) return fn();
  const start = `${name}:start`;
  performance.mark(start);
  try {
    return fn();
  } finally {
    performance.measure(name, start);
  }
}

export function measures(): Record<string, Percentiles> {
  const groups = new Map<string, Samples>();
  for (const entry of performance.getEntriesByType("measure")) {
    let samples = groups.get(entry.name);
    if (!samples) {
      samples = new Samples();
      groups.set(entry.name, samples);
    }
    samples.push(entry.duration);
  }
  performance.clearMeasures();
  performance.clearMarks();
  return Object.fromEntries([...groups].map(([name, s]) => [name, s.percentiles()]));
}
