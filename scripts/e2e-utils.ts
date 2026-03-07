#!/usr/bin/env bun
/**
 * Shared E2E utilities.
 *
 * - ensurePortFree: kill any process occupying the target port
 * - cleanupBuildDir: remove build artifacts after test run
 */

import { existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

/** Kill any process occupying the given port, then wait for release. */
export async function ensurePortFree(port: string): Promise<void> {
  try {
    const result = execSync(`lsof -ti:${port}`, { encoding: "utf-8" }).trim();
    if (result) {
      console.log(`⚠️  Port ${port} is occupied by PID ${result}, killing...`);
      execSync(`kill -9 ${result}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch {
    // lsof returns non-zero when no process found — port is free
  }
}

/** Remove a build directory if it exists. */
export function cleanupBuildDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`🗑️  Removed ${dir}`);
  }
}
