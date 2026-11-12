import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from "prom-client";

export const REJECTION_REASONS = [
  "bad_message",
  "rate_limited",
  "join_timeout",
  "slow_client",
  "room_full",
  "no_room",
  "origin",
  "ip_limit",
  "heartbeat",
  "shutting_down",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export interface LiveNumbers {
  players(): number;
  rooms(): number;
  tickP99Ms(): number;
}

export class Metrics {
  readonly registry = new Registry();
  readonly connections: Gauge;
  readonly messagesIn: Counter<"format">;
  readonly messagesOut: Counter;
  readonly bytesIn: Counter;
  readonly bytesOut: Counter;
  readonly rejections: Counter<"reason">;
  readonly tickSeconds: Histogram;
  #live: LiveNumbers = { players: () => 0, rooms: () => 0, tickP99Ms: () => 0 };
  #elu = performance.eventLoopUtilization();

  constructor() {
    const registers = [this.registry];
    collectDefaultMetrics({ register: this.registry, prefix: "gloop_" });
    this.connections = new Gauge({
      name: "gloop_connections",
      help: "Open WebSocket connections",
      registers,
    });
    this.messagesIn = new Counter({
      name: "gloop_messages_in_total",
      help: "Messages received from clients",
      labelNames: ["format"],
      registers,
    });
    this.messagesOut = new Counter({
      name: "gloop_messages_out_total",
      help: "Messages sent",
      registers,
    });
    this.bytesIn = new Counter({ name: "gloop_bytes_in_total", help: "Bytes received", registers });
    this.bytesOut = new Counter({ name: "gloop_bytes_out_total", help: "Bytes sent", registers });
    this.rejections = new Counter({
      name: "gloop_rejections_total",
      help: "Connections or messages rejected, by reason",
      labelNames: ["reason"],
      registers,
    });
    for (const reason of REJECTION_REASONS) this.rejections.inc({ reason }, 0);
    this.tickSeconds = new Histogram({
      name: "gloop_tick_seconds",
      help: "Duration of one match tick",
      buckets: [0.0005, 0.001, 0.002, 0.004, 0.008, 0.016, 0.033, 0.066],
      registers,
    });
    const live = () => this.#live;
    new Gauge({
      name: "gloop_players",
      help: "Players in rooms (bots included)",
      registers,
      collect() {
        this.set(live().players());
      },
    });
    new Gauge({
      name: "gloop_rooms",
      help: "Open rooms",
      registers,
      collect() {
        this.set(live().rooms());
      },
    });
    new Gauge({
      name: "gloop_tick_p99_ms",
      help: "Worst tick p99 over the last 300 ticks of every match",
      registers,
      collect() {
        this.set(live().tickP99Ms());
      },
    });
    const elu = () => this.#sampleElu();
    new Gauge({
      name: "gloop_event_loop_utilization",
      help: "Event loop utilization since the previous scrape",
      registers,
      collect() {
        this.set(elu());
      },
    });
  }

  #sampleElu(): number {
    const now = performance.eventLoopUtilization();
    const value = performance.eventLoopUtilization(now, this.#elu).utilization;
    this.#elu = now;
    return value;
  }

  attach(live: LiveNumbers): void {
    this.#live = live;
  }

  reject(reason: RejectionReason): void {
    this.rejections.inc({ reason });
  }

  async rejectionCount(reason: RejectionReason): Promise<number> {
    const data = await this.rejections.get();
    return data.values.find((v) => v.labels.reason === reason)?.value ?? 0;
  }
}

export const metrics = new Metrics();
