export type Fields = Readonly<Record<string, unknown>>;
export type Level = "info" | "warn" | "error";

export interface Logger {
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
}

function write(level: Level, message: string, fields: Fields): void {
  const line = { time: new Date().toISOString(), level, message, ...fields };
  const out = level === "info" ? process.stdout : process.stderr;
  out.write(`${JSON.stringify(line)}\n`);
}

export const logger: Logger = {
  info: (message, fields = {}) => write("info", message, fields),
  warn: (message, fields = {}) => write("warn", message, fields),
  error: (message, fields = {}) => write("error", message, fields),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
