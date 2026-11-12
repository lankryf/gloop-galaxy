import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import type { ServerConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { createHandler } from "./http.ts";
import { errorMessage, logger } from "./logger.ts";
import { RoomManager } from "./rooms.ts";
import { attachSockets } from "./ws.ts";

let config: ServerConfig;
try {
  config = loadConfig();
} catch (error: unknown) {
  logger.error(errorMessage(error));
  process.exit(1);
}

const rooms = new RoomManager({ ...config, logger });
rooms.create({ name: "Туманність Слимака", arena: "nebula", persistent: true });
rooms.create({ name: "Космічне звалище", arena: "junkyard", persistent: true });

const server = createServer(createHandler({ rooms, config, logger }));
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
const sockets = attachSockets(wss, { rooms, config, logger });

server.listen(config.port, config.host, () => {
  logger.info("listening", { port: config.port, host: config.host, static: config.staticDir });
});

let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info("shutting down", { signal });
  const force = setTimeout(() => {
    logger.error("forced exit after timeout");
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close();
  sockets.close();
  wss.close();
  await rooms.closeAll();
  server.closeAllConnections();
  logger.info("bye");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
