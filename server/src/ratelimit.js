export class TokenBucket {
  constructor({ ratePerSecond, burst = ratePerSecond, now = () => performance.now() }) {
    this.rate = ratePerSecond;
    this.burst = burst;
    this.tokens = burst;
    this.now = now;
    this.last = now();
  }

  take(count = 1) {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.rate);
    this.last = t;
    if (this.tokens < count) return false;
    this.tokens -= count;
    return true;
  }
}
