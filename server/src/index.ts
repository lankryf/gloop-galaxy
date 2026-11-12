import { createApp } from "./app.ts";
import type { ServerConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { errorMessage, logger } from "./logger.ts";

let config: ServerConfig;
try {
  config = loadConfig();
} catch (error: unknown) {
  logger.error(errorMessage(error));
  process.exit(1);
}

const app = createApp(config, logger);
app.rooms.create({ name: "Туманність Слимака", arena: "nebula", persistent: true });
app.rooms.create({ name: "Космічне звалище", arena: "junkyard", persistent: true });

const address = await app.listen();
logger.info("listening", { port: address.port, host: config.host, static: config.staticDir });

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

  await app.close();
  logger.info("bye");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
