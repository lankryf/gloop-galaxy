function write(level, message, fields) {
  const line = { time: new Date().toISOString(), level, message, ...fields };
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  out.write(`${JSON.stringify(line)}\n`);
}

export const logger = {
  info: (message, fields = {}) => write("info", message, fields),
  warn: (message, fields = {}) => write("warn", message, fields),
  error: (message, fields = {}) => write("error", message, fields),
};
