import pino from "pino";

export type Fields = Readonly<Record<string, unknown>>;
export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;
export type Level = (typeof LOG_LEVELS)[number];

export interface Logger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
  fatal(message: string, fields?: Fields): void;
  child(bindings: Fields): Logger;
}

function isLevel(value: string | undefined): value is Level {
  return LOG_LEVELS.some((level) => level === value);
}

function wrap(p: pino.Logger): Logger {
  return {
    debug: (message, fields = {}) => p.debug(fields, message),
    info: (message, fields = {}) => p.info(fields, message),
    warn: (message, fields = {}) => p.warn(fields, message),
    error: (message, fields = {}) => p.error(fields, message),
    fatal: (message, fields = {}) => p.fatal(fields, message),
    child: (bindings) => wrap(p.child(bindings)),
  };
}

export function createLogger(
  level: string | undefined = process.env.LOG_LEVEL,
  base: Fields = {},
): Logger {
  return wrap(
    pino({
      level: isLevel(level) ? level : "info",
      base: { service: "gloop", ...base },
      messageKey: "message",
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: {
        paths: ["token", "password", "*.token", "*.password", "headers.cookie"],
        remove: true,
      },
    }),
  );
}

export const silentLogger: Logger = createLogger("silent");

export const logger: Logger = createLogger();

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorFields(error: unknown): Fields {
  return error instanceof Error
    ? { error: error.message, stack: error.stack }
    : { error: String(error) };
}
