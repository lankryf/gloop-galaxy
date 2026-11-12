import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import type { ServerConfig } from "./config.ts";
import { ConnectionGate } from "./gate.ts";
import { createHandler } from "./http.ts";
import type { Logger } from "./logger.ts";
import { metrics } from "./metrics.ts";
import { RoomManager } from "./rooms.ts";
import { attachSockets } from "./ws.ts";

export interface App {
  readonly server: Server;
  readonly wss: WebSocketServer;
  readonly rooms: RoomManager;
  readonly gate: ConnectionGate;
  readonly ready: boolean;
  listen(): Promise<AddressInfo>;
  close(): Promise<void>;
}

const STATUS_TEXT: Readonly<Record<number, string>> = {
  403: "Forbidden",
  404: "Not Found",
  429: "Too Many Requests",
  503: "Service Unavailable",
};

export function createApp(config: ServerConfig, logger: Logger): App {
  let ready = false;
  const rooms = new RoomManager({ ...config, logger });
  const gate = new ConnectionGate(config);
  const server = createServer(createHandler({ rooms, config, logger, isReady: () => ready }));
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const sockets = attachSockets(wss, { rooms, config, logger, gate });

  metrics.attach({
    players: () => rooms.playerCount,
    rooms: () => rooms.list().length,
    tickP99Ms: () => Math.max(0, ...rooms.stats().map((m) => m.tickMs.p99)),
  });

  server.on("upgrade", (req, socket, head) => {
    const refuse = (status: number) => {
      socket.end(
        `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
    };
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname !== "/ws") return refuse(404);
    if (!ready) {
      metrics.reject("shutting_down");
      return refuse(503);
    }
    const admitted = gate.admit(req);
    if (!admitted.ok) {
      metrics.reject(admitted.error.reason);
      logger.warn("upgrade refused", {
        reason: admitted.error.reason,
        ip: gate.ipOf(req),
        origin: req.headers.origin,
      });
      return refuse(admitted.error.status);
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req, admitted.value));
  });

  return {
    server,
    wss,
    rooms,
    gate,
    get ready() {
      return ready;
    },
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          const address = server.address();
          if (address && typeof address === "object") {
            ready = true;
            resolve(address);
          } else reject(new Error("server has no address"));
        });
      });
    },
    async close() {
      ready = false;
      server.close();
      await sockets.close();
      wss.close();
      await rooms.closeAll();
      server.closeAllConnections();
    },
  };
}
