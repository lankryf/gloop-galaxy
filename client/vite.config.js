import { defineConfig } from "vite";

function testingMiddleware() {
  return {
    name: "testing-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
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
          flaky.set(key, (flaky.get(key) ?? 0) + 1);
          if (flaky.get(key) <= 2) {
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

const flaky = new Map();

export default defineConfig({
  appType: "mpa",
  plugins: [testingMiddleware()],
});
