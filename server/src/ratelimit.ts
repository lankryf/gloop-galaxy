export class TokenBucket {
  readonly rate: number;
  readonly burst: number;
  readonly now: () => number;
  tokens: number;
  last: number;

  constructor({
    ratePerSecond,
    burst = ratePerSecond,
    now = () => performance.now(),
  }: { ratePerSecond: number; burst?: number; now?: () => number }) {
    this.rate = ratePerSecond;
    this.burst = burst;
    this.tokens = burst;
    this.now = now;
    this.last = now();
  }

  take(count = 1): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.rate);
    this.last = t;
    if (this.tokens < count) return false;
    this.tokens -= count;
    return true;
  }
}
