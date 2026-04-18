/**
 * API key helpers.
 *
 * Plain keys are shown to the user exactly once at generation time and
 * never persisted. We store the SHA-256 hash for verification and a short
 * prefix for display ("pk_xxxxxxxx...").
 */

/** Generate a random API key: pk_ prefix + 32 hex chars. */
export function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `pk_${hex}`;
}

/** Compute the SHA-256 hex digest of a string (used to hash api keys). */
export async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** First 8 characters of a key, kept for display in account/UI surfaces. */
export function apiKeyPrefix(key: string): string {
  return key.slice(0, 8);
}
