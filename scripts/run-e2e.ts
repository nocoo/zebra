#!/usr/bin/env bun
/**
 * L3 API E2E Test Runner
 *
 * 1. Ensures port 17029 is free
 * 2. Starts Next.js dev server with E2E_SKIP_AUTH=true
 * 3. Runs API-level E2E tests
 * 4. Cleans up
 */

import { spawn, type Subprocess } from "bun";
import { ensurePortFree, cleanupBuildDir } from "./e2e-utils";

const E2E_PORT = process.env.E2E_PORT || "17029";
const E2E_DIST_DIR = "packages/web/.next-e2e";

let serverProcess: Subprocess | null = null;

async function waitForServer(maxAttempts = 60): Promise<boolean> {
  const baseUrl = `http://localhost:${E2E_PORT}`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return false;
}

async function cleanup() {
  console.log("\n🧹 Cleaning up...");
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  cleanupBuildDir(E2E_DIST_DIR);
}

async function main() {
  console.log("🚀 L3 API E2E Test Runner\n");
  await ensurePortFree(E2E_PORT);

  console.log(`🌐 Starting E2E server on port ${E2E_PORT}...`);
  serverProcess = spawn(["bun", "run", "next", "dev", "-p", E2E_PORT], {
    cwd: "packages/web",
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-e2e",
      E2E_SKIP_AUTH: "true",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const ready = await waitForServer();
  if (!ready) {
    console.error("❌ Server failed to start within 30s");
    await cleanup();
    process.exit(1);
  }

  console.log("✅ Server ready\n");
  console.log("🧪 Running L3 API E2E tests...\n");

  const testResult = Bun.spawnSync(
    ["bun", "test", "packages/web/src/__tests__/e2e", "--timeout", "30000"],
    {
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, E2E_PORT },
    }
  );

  await cleanup();
  process.exit(testResult.exitCode ?? 1);
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(1);
});
process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(1);
});

main();
