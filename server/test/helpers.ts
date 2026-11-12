import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ServerMessage } from "@gloop/shared/protocol.ts";
import { parseServerMessage } from "@gloop/shared/protocol.ts";
import type { ClientOptions } from "ws";
import { WebSocket } from "ws";
import type { App } from "../src/app.ts";
import { createApp } from "../src/app.ts";
import type { ServerConfig } from "../src/config.ts";
import { loadConfig } from "../src/config.ts";
import type { Logger } from "../src/logger.ts";

export const quiet: Logger = { info() {}, warn() {}, error() {} };

export interface TestServer {
  readonly app: App;
  readonly http: string;
  readonly ws: string;
  readonly roomId: string;
  close(): Promise<void>;
}

export async function startTestServer(env: Record<string, string> = {}): Promise<TestServer> {
  const logDir = mkdtempSync(path.join(tmpdir(), "gloop-"));
  const config: ServerConfig = loadConfig({
    PORT: "1",
    HOST: "127.0.0.1",
    LOG_DIR: logDir,
    ...env,
  });
  const app = createApp({ ...config, port: 0 }, quiet);
  const room = app.rooms.create({ name: "test", arena: "nebula", persistent: true });
  const { port } = await app.listen();
  return {
    app,
    http: `http://127.0.0.1:${port}`,
    ws: `ws://127.0.0.1:${port}/ws`,
    roomId: room.id,
    close: () => app.close(),
  };
}

export class TestClient {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  readonly binary: Buffer[] = [];
  readonly closed: Promise<{ code: number; reason: string }>;
  #waiters: (() => void)[] = [];

  constructor(url: string, options: ClientOptions = {}) {
    this.socket = new WebSocket(url, options);
    this.socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) this.binary.push(data);
      else {
        const parsed = parseServerMessage(data.toString("utf8"));
        if (parsed.ok) this.messages.push(parsed.value);
      }
      for (const wake of this.#waiters.splice(0)) wake();
    });
    this.closed = new Promise((resolve) => {
      this.socket.on("close", (code: number, reason: Buffer) =>
        resolve({ code, reason: reason.toString() }),
      );
    });
  }

  opened(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
  }

  send(message: unknown): void {
    this.socket.send(typeof message === "string" ? message : JSON.stringify(message));
  }

  async next<T extends ServerMessage["type"]>(
    type: T,
    timeoutMs = 2000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find(
        (m): m is Extract<ServerMessage, { type: T }> => m.type === type,
      );
      if (found) {
        this.messages.splice(this.messages.indexOf(found), 1);
        return found;
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`no ${type} within ${timeoutMs} ms`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.#waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  close(): void {
    this.socket.close();
  }
}
