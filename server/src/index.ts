import { createApp } from "./app.ts";
import type { ServerConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { createLogger, errorFields, errorMessage } from "./logger.ts";
import { COMMIT, VERSION } from "./version.ts";

let config: ServerConfig;
try {
  config = loadConfig();
} catch (error: unknown) {
  createLogger().fatal(errorMessage(error));
  process.exit(1);
}

const logger = createLogger(config.logLevel, { version: VERSION, commit: COMMIT });

process.on("uncaughtException", (error) => {
  logger.fatal("uncaught exception", errorFields(error));
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.fatal("unhandled rejection", errorFields(reason));
  process.exit(1);
});

const app = createApp(config, logger);
app.rooms.create({ name: "Туманність Слимака", arena: "nebula", persistent: true });
app.rooms.create({ name: "Космічне звалище", arena: "junkyard", persistent: true });

const address = await app.listen();
logger.info("listening", { port: address.port, host: config.host, static: config.staticDir });

let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  const started = performance.now();
  logger.info("shutting down", { signal });
  const force = setTimeout(() => {
    logger.error("forced exit after timeout");
    process.exit(1);
  }, config.shutdownTimeoutMs);
  force.unref();

  await app.close();
  logger.info("bye", { ms: Math.round(performance.now() - started) });
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
