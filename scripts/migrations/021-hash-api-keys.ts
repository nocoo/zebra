#!/usr/bin/env bun
/**
 * One-off backfill: hash existing plain `users.api_key` values into the new
 * `api_key_hash` and `api_key_prefix` columns added by migration 021.
 *
 * Run AFTER step 1 of `021-hash-api-keys.sql` (which adds the columns) and
 * BEFORE step 3 (which drops the plain `api_key` column).
 *
 * Reads Cloudflare credentials from packages/web/.env.local.
 * Usage: bun scripts/migrations/021-hash-api-keys.ts
 *
 * Idempotent — rows whose `api_key_hash` is already set are skipped.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Load .env.local manually (no dotenv dependency)
// ---------------------------------------------------------------------------

const envPath = resolve(
  import.meta.dirname as string,
  "../../packages/web/.env.local",
);
const envContent = readFileSync(envPath, "utf-8");
const envVars: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const CF_ACCOUNT_ID = envVars.CF_ACCOUNT_ID;
const CF_D1_DATABASE_ID = envVars.CF_D1_DATABASE_ID;
const CF_D1_API_TOKEN = envVars.CF_D1_API_TOKEN;

if (!CF_ACCOUNT_ID || !CF_D1_DATABASE_ID || !CF_D1_API_TOKEN) {
  console.error("Missing Cloudflare D1 credentials in .env.local");
  process.exit(1);
}

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;

async function d1Query<T = unknown>(
  sql: string,
  params: unknown[] = [],
): Promise<{ result: Array<{ results: T[] }> }> {
  const resp = await fetch(D1_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_D1_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  if (!resp.ok) {
    throw new Error(`D1 API error (${resp.status}): ${await resp.text()}`);
  }
  return resp.json();
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Backfill loop
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  api_key: string;
}

console.log("Fetching users with plain api_key but no api_key_hash...");
const rows = await d1Query<UserRow>(
  `SELECT id, api_key FROM users
   WHERE api_key IS NOT NULL AND api_key_hash IS NULL`,
);
const users = rows.result[0]?.results ?? [];
console.log(`Found ${users.length} users to backfill.`);

let done = 0;
for (const u of users) {
  const hash = await sha256Hex(u.api_key);
  const prefix = u.api_key.slice(0, 8);
  await d1Query(
    `UPDATE users SET api_key_hash = ?, api_key_prefix = ? WHERE id = ?`,
    [hash, prefix, u.id],
  );
  done++;
  if (done % 50 === 0) console.log(`  ${done} / ${users.length}`);
}

console.log(`Backfill complete: ${done} users updated.`);
console.log(
  "Next step: deploy the new code, then run the DROP in migration 021 step 3.",
);
