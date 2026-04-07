import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkShowcaseRateLimit,
  SHOWCASE_CREATE_RATE_LIMIT,
  type RateLimitConfig,
} from "@/lib/rate-limit";
import type { DbRead } from "@/lib/db";

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

function createMockDbRead(count: number): DbRead {
  return {
    firstOrNull: vi.fn().mockResolvedValue({ count }),
    first: vi.fn(),
    query: vi.fn(),
  } as unknown as DbRead;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkShowcaseRateLimit", () => {
  const defaultConfig: RateLimitConfig = {
    maxRequests: 5,
    windowSeconds: 3600,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows request when under limit", async () => {
    const dbRead = createMockDbRead(2);
    const result = await checkShowcaseRateLimit(dbRead, "user-1", defaultConfig);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(2);
    expect(result.limit).toBe(5);
    expect(result.retryAfter).toBe(0);
  });

  it("allows request when at limit - 1", async () => {
    const dbRead = createMockDbRead(4);
    const result = await checkShowcaseRateLimit(dbRead, "user-1", defaultConfig);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(4);
  });

  it("denies request when at limit", async () => {
    const dbRead = createMockDbRead(5);
    const result = await checkShowcaseRateLimit(dbRead, "user-1", defaultConfig);

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(5);
    expect(result.limit).toBe(5);
    expect(result.retryAfter).toBe(3600);
  });

  it("denies request when over limit", async () => {
    const dbRead = createMockDbRead(10);
    const result = await checkShowcaseRateLimit(dbRead, "user-1", defaultConfig);

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(10);
  });

  it("allows request when count is 0", async () => {
    const dbRead = createMockDbRead(0);
    const result = await checkShowcaseRateLimit(dbRead, "user-1", defaultConfig);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
  });

  it("handles null result from query", async () => {
    const dbRead = {
      firstOrNull: vi.fn().mockResolvedValue(null),
    } as unknown as DbRead;

    const result = await checkShowcaseRateLimit(dbRead, "user-1", defaultConfig);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
  });

  it("queries with correct time window", async () => {
    const dbRead = createMockDbRead(0);
    const now = Date.now();
    vi.setSystemTime(now);

    await checkShowcaseRateLimit(dbRead, "user-1", defaultConfig);

    const expectedWindowStart = new Date(now - 3600 * 1000).toISOString();
    expect(dbRead.firstOrNull).toHaveBeenCalledWith(
      expect.stringContaining("WHERE user_id = ? AND created_at >= ?"),
      ["user-1", expectedWindowStart]
    );

    vi.useRealTimers();
  });

  it("uses custom config values", async () => {
    const dbRead = createMockDbRead(2);
    const customConfig: RateLimitConfig = {
      maxRequests: 3,
      windowSeconds: 60,
    };

    const result = await checkShowcaseRateLimit(dbRead, "user-1", customConfig);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(3);
  });

  it("denies with custom config when over limit", async () => {
    const dbRead = createMockDbRead(3);
    const customConfig: RateLimitConfig = {
      maxRequests: 3,
      windowSeconds: 60,
    };

    const result = await checkShowcaseRateLimit(dbRead, "user-1", customConfig);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(60);
  });
});

describe("SHOWCASE_CREATE_RATE_LIMIT", () => {
  it("has correct default values", () => {
    expect(SHOWCASE_CREATE_RATE_LIMIT.maxRequests).toBe(20);
    expect(SHOWCASE_CREATE_RATE_LIMIT.windowSeconds).toBe(3600);
  });
});
