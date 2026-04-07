/**
 * Simple rate limiting utilities.
 *
 * Uses D1 to track request counts within sliding time windows.
 * No external dependencies (Redis, etc.) required.
 */

import { type DbRead } from "./db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Requests made in current window */
  current: number;
  /** Maximum allowed requests */
  limit: number;
  /** Seconds until window resets (approximate) */
  retryAfter: number;
}

// ---------------------------------------------------------------------------
// Rate Limit Check
// ---------------------------------------------------------------------------

/**
 * Check if a user has exceeded rate limit for showcase creation.
 *
 * Uses the showcases table's created_at to count recent creations.
 * This is a simple per-user rate limit, not a global one.
 *
 * @param dbRead - Database read client
 * @param userId - User ID to check
 * @param config - Rate limit configuration
 * @returns Rate limit result with allowed status and metadata
 */
export async function checkShowcaseRateLimit(
  dbRead: DbRead,
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const windowStart = new Date(
    Date.now() - config.windowSeconds * 1000
  ).toISOString();

  const result = await dbRead.firstOrNull<{ count: number }>(
    `SELECT COUNT(*) as count FROM showcases
     WHERE user_id = ? AND created_at >= ?`,
    [userId, windowStart]
  );

  const current = result?.count ?? 0;
  const allowed = current < config.maxRequests;

  return {
    allowed,
    current,
    limit: config.maxRequests,
    // Approximate: assume evenly distributed, return full window
    retryAfter: allowed ? 0 : config.windowSeconds,
  };
}

// ---------------------------------------------------------------------------
// Default Configurations
// ---------------------------------------------------------------------------

/** Rate limit for showcase creation: 5 showcases per hour */
export const SHOWCASE_CREATE_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 5,
  windowSeconds: 3600, // 1 hour
};
