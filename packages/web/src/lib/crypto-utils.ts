/**
 * Shared cryptographic utilities for API key management.
 *
 * API keys use the format: pk_ + 32 hex chars (128 bits of entropy).
 * Keys are stored as SHA-256 hashes prefixed with "hash:" to distinguish
 * from legacy plaintext values during migration.
 */

import { createHash } from "crypto";

/** Generate a random API key: pk_ prefix + 32 hex chars (128-bit entropy) */
export function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return `pk_${hex}`;
}

/** Hash an API key for storage: "hash:" + SHA-256 hex digest */
export function hashApiKey(key: string): string {
  return "hash:" + createHash("sha256").update(key).digest("hex");
}

