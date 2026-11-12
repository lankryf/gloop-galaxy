import { execFileSync } from "node:child_process";

function fromGit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export const COMMIT = process.env.GIT_SHA?.slice(0, 7) || fromGit() || "unknown";
export const VERSION = process.env.APP_VERSION || "dev";
