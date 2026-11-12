import { defineConfig, devices } from "@playwright/test";

const port = 8090;
const executablePath = process.env.CHROME_PATH;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: "npm run build && npm start",
    url: `http://127.0.0.1:${port}/api/rooms`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: String(port),
      HOST: "127.0.0.1",
      STATIC_DIR: "../client/dist",
      LOG_DIR: "../logs/e2e",
    },
  },
});
