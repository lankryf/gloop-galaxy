import { execFileSync } from "node:child_process";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

function gitCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
  } catch {
    return "unknown";
  }
}

const commit = process.env.GIT_SHA?.slice(0, 7) || gitCommit();
const version = process.env.APP_VERSION || "dev";

function testingMiddleware(): Plugin {
  return {
    name: "testing-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const delay = Number(url.searchParams.get("delay") ?? 0);
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));

        const status = Number(url.searchParams.get("status") ?? 0);
        if (status) {
          res.statusCode = status;
          res.end(`forced ${status}`);
          return;
        }

        if (url.searchParams.has("corrupt")) {
          res.setHeader("Content-Type", "application/json");
          res.end('{"name": "broken", "asteroids": ');
          return;
        }

        if (url.searchParams.has("flaky")) {
          const key = url.search;
          const hits = (flaky.get(key) ?? 0) + 1;
          flaky.set(key, hits);
          if (hits <= 2) {
            res.statusCode = 503;
            res.end("try again");
            return;
          }
        }
        next();
      });
    },
  };
}

const flaky = new Map<string, number>();

export default defineConfig({
  appType: "mpa",
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __COMMIT__: JSON.stringify(commit),
  },
  plugins: [testingMiddleware()],
  server: {
    host: true,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/ws": { target: "ws://127.0.0.1:8080", ws: true },
      "/health": "http://127.0.0.1:8080",
    },
  },
});
