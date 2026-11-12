import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import type { ServerConfig } from "./config.ts";
import { createHandler } from "./http.ts";
import type { Logger } from "./logger.ts";
import { RoomManager } from "./rooms.ts";
import { attachSockets } from "./ws.ts";

export interface App {
  readonly server: Server;
  readonly wss: WebSocketServer;
  readonly rooms: RoomManager;
  listen(): Promise<AddressInfo>;
  close(): Promise<void>;
}

export function createApp(config: ServerConfig, logger: Logger): App {
  const rooms = new RoomManager({ ...config, logger });
  const server = createServer(createHandler({ rooms, config, logger }));
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
  const sockets = attachSockets(wss, { rooms, config, logger });

  return {
    server,
    wss,
    rooms,
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          const address = server.address();
          if (address && typeof address === "object") resolve(address);
          else reject(new Error("server has no address"));
        });
      });
    },
    async close() {
      server.close();
      sockets.close();
      wss.close();
      await rooms.closeAll();
      server.closeAllConnections();
    },
  };
}
