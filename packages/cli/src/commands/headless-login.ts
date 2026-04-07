/**
 * Headless CLI login — prints a URL for the user to visit on any device.
 *
 * Flow:
 * 1. Generate a random session_id
 * 2. Print URL: {apiUrl}/api/auth/cli?headless={session_id}
 * 3. Poll {apiUrl}/api/auth/cli/poll with { session: session_id }
 * 4. When token arrives, save to config
 */

import { randomBytes } from "node:crypto";
import { ConfigManager } from "../config/manager.js";
import { log } from "../log.js";
import { pc } from "@nocoo/cli-base";

export interface HeadlessLoginOptions {
  configDir: string;
  apiUrl: string;
  dev?: boolean;
  force?: boolean;
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeoutMs?: number;
  /** Poll interval in milliseconds (default: 3000) */
  pollIntervalMs?: number;
}

export interface HeadlessLoginResult {
  success: boolean;
  email?: string;
  alreadyLoggedIn?: boolean;
  error?: string;
}

export async function executeHeadlessLogin(
  options: HeadlessLoginOptions,
): Promise<HeadlessLoginResult> {
  const {
    configDir,
    apiUrl,
    dev = false,
    force = false,
    timeoutMs = 5 * 60 * 1000,
    pollIntervalMs = 3000,
  } = options;

  const configManager = new ConfigManager(configDir, dev);

  // Check existing login
  if (!force) {
    const existing = await configManager.load();
    if (existing.token) {
      return { success: true, alreadyLoggedIn: true };
    }
  }

  // Generate session ID
  const sessionId = randomBytes(16).toString("hex");
  const loginUrl = `${apiUrl}/api/auth/cli?headless=${sessionId}`;

  log.info("");
  log.info(`  ${pc.bold("🔗 Open this URL in your browser:")}`);
  log.info(`  ${pc.cyan(pc.underline(loginUrl))}`);
  log.info("");
  log.info(`  ${pc.dim("Waiting for authorization... (expires in 5 minutes)")}`);

  // Poll for token
  const startTime = Date.now();
  const pollUrl = `${apiUrl}/api/auth/cli/poll`;

  while (Date.now() - startTime < timeoutMs) {
    await sleep(pollIntervalMs);

    try {
      const res = await fetch(pollUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: sessionId }),
      });

      if (!res.ok) {
        if (res.status === 410) {
          return { success: false, error: "Session expired" };
        }
        continue; // Retry on server errors
      }

      const data = (await res.json()) as {
        status: string;
        api_key?: string;
        email?: string;
      };

      if (data.status === "ok" && data.api_key) {
        configManager.write({ token: data.api_key });
        return { success: true, email: data.email };
      }

      // status === "pending" — keep polling
    } catch {
      // Network error — keep trying
    }
  }

  return { success: false, error: "Login timeout — no response received" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
