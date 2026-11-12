import type { IncomingMessage } from "node:http";
import type { Result } from "@gloop/shared/result.ts";
import { fail, ok } from "@gloop/shared/result.ts";
import type { RejectionReason } from "./metrics.ts";

export interface GateOptions {
  readonly allowedOrigins: readonly string[];
  readonly maxConnectionsPerIp: number;
  readonly trustProxy: boolean;
}

export interface Refusal {
  readonly status: number;
  readonly reason: RejectionReason;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export class ConnectionGate {
  readonly #options: GateOptions;
  readonly #perIp = new Map<string, number>();

  constructor(options: GateOptions) {
    this.#options = options;
  }

  ipOf(req: IncomingMessage): string {
    if (this.#options.trustProxy) {
      const forwarded = header(req, "x-forwarded-for")?.split(",")[0]?.trim();
      if (forwarded) return forwarded;
    }
    return req.socket.remoteAddress ?? "unknown";
  }

  originAllowed(req: IncomingMessage): boolean {
    const origin = header(req, "origin");
    if (!origin) return true;
    if (this.#options.allowedOrigins.includes(origin)) return true;
    if (this.#options.allowedOrigins.length > 0) return false;
    try {
      return new URL(origin).host === header(req, "host");
    } catch {
      return false;
    }
  }

  admit(req: IncomingMessage): Result<string, Refusal> {
    if (!this.originAllowed(req)) return fail({ status: 403, reason: "origin" });
    const ip = this.ipOf(req);
    const open = this.#perIp.get(ip) ?? 0;
    if (open >= this.#options.maxConnectionsPerIp) return fail({ status: 429, reason: "ip_limit" });
    this.#perIp.set(ip, open + 1);
    return ok(ip);
  }

  release(ip: string): void {
    const open = (this.#perIp.get(ip) ?? 1) - 1;
    if (open <= 0) this.#perIp.delete(ip);
    else this.#perIp.set(ip, open);
  }

  connectionsFrom(ip: string): number {
    return this.#perIp.get(ip) ?? 0;
  }
}
