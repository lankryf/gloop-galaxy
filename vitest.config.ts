import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["shared", "server", "client"],
    coverage: {
      provider: "v8",
      include: ["shared/**/*.ts", "server/src/**/*.ts", "client/src/**/*.ts"],
      exclude: ["**/test/**", "**/scripts/**", "**/*.config.ts", "**/*.d.ts"],
      reporter: ["text-summary", "text", "html"],
    },
  },
});
