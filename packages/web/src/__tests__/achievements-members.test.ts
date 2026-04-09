import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/achievements/[id]/members/route";
import * as dbModule from "@/lib/db";
import { createMockDbRead } from "./test-utils";

// Mock DB
vi.mock("@/lib/db", () => ({
  getDbRead: vi.fn(),
  getDbWrite: vi.fn(),
  resetDb: vi.fn(),
}));

const BASE = "http://localhost:7020";

function makeGetRequest(path: string, params: Record<string, string> = {}): Request {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

describe("GET /api/achievements/[id]/members", () => {
  let mockDb: ReturnType<typeof createMockDbRead>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDbRead();
    vi.mocked(dbModule.getDbRead).mockResolvedValue(mockDb as any);
  });

  describe("validation", () => {
    it("should return 404 for unknown achievement", async () => {
      const res = await GET(
        makeGetRequest("/api/achievements/nonexistent/members"),
        { params: Promise.resolve({ id: "nonexistent" }) },
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("should return 404 for timezone-dependent achievement", async () => {
      const res = await GET(
        makeGetRequest("/api/achievements/night-owl/members"),
        { params: Promise.resolve({ id: "night-owl" }) },
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("timezone-dependent");
    });

    it("should reject invalid limit", async () => {
      const res = await GET(
        makeGetRequest("/api/achievements/power-user/members", { limit: "999" }),
        { params: Promise.resolve({ id: "power-user" }) },
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("limit");
    });

    it("should reject invalid cursor", async () => {
      const res = await GET(
        makeGetRequest("/api/achievements/power-user/members", { cursor: "abc" }),
        { params: Promise.resolve({ id: "power-user" }) },
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("cursor");
    });
  });

  describe("response structure", () => {
    it("should return members array and cursor", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "Alice", image: null, slug: "alice", value: 5_000_000, earned_at: "2026-01-15T10:00:00Z" },
        { id: "u2", name: "Bob", image: "https://example.com/bob.jpg", slug: "bob", value: 2_000_000, earned_at: "2026-02-01T08:00:00Z" },
      ]);

      const res = await GET(
        makeGetRequest("/api/achievements/power-user/members"),
        { params: Promise.resolve({ id: "power-user" }) },
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.members).toBeDefined();
      expect(Array.isArray(body.members)).toBe(true);
      expect(body.members).toHaveLength(2);
      expect(body.cursor).toBeNull(); // No more results
    });

    it("should return correct member fields", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "Alice", image: "https://example.com/alice.jpg", slug: "alice", value: 200_000_000_000, earned_at: "2026-01-15T10:00:00Z" },
      ]);

      const res = await GET(
        makeGetRequest("/api/achievements/power-user/members"),
        { params: Promise.resolve({ id: "power-user" }) },
      );

      const body = await res.json();
      const member = body.members[0];

      expect(member.id).toBe("u1");
      expect(member.name).toBe("Alice");
      expect(member.image).toBe("https://example.com/alice.jpg");
      expect(member.slug).toBe("alice");
      expect(member.tier).toBe("diamond"); // 200B tokens with tiers [1B, 10B, 50B, 200B]
      expect(member.earnedAt).toBe("2026-01-15T10:00:00Z");
      expect(member.currentValue).toBe(200_000_000_000);
    });

    it("should compute correct tier from value", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "Diamond", image: null, slug: null, value: 200_000_000_000, earned_at: "2026-01-01T00:00:00Z" },
        { id: "u2", name: "Gold", image: null, slug: null, value: 50_000_000_000, earned_at: "2026-01-01T00:00:00Z" },
        { id: "u3", name: "Silver", image: null, slug: null, value: 10_000_000_000, earned_at: "2026-01-01T00:00:00Z" },
        { id: "u4", name: "Bronze", image: null, slug: null, value: 1_000_000_000, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      const res = await GET(
        makeGetRequest("/api/achievements/power-user/members"),
        { params: Promise.resolve({ id: "power-user" }) },
      );

      const body = await res.json();
      expect(body.members[0].tier).toBe("diamond");
      expect(body.members[1].tier).toBe("gold");
      expect(body.members[2].tier).toBe("silver");
      expect(body.members[3].tier).toBe("bronze");
    });

    it("should handle null name as Anonymous", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: null, image: null, slug: null, value: 1_000_000_000, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      const res = await GET(
        makeGetRequest("/api/achievements/power-user/members"),
        { params: Promise.resolve({ id: "power-user" }) },
      );

      const body = await res.json();
      expect(body.members[0].name).toBe("Anonymous");
    });

    it("should use current timestamp when earned_at is null", async () => {
      const beforeCall = new Date();
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 50, earned_at: null },
      ]);

      const res = await GET(
        makeGetRequest("/api/achievements/cache-master/members"),
        { params: Promise.resolve({ id: "cache-master" }) },
      );

      const body = await res.json();
      const earnedAt = new Date(body.members[0].earnedAt);
      expect(earnedAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
    });
  });

  describe("pagination", () => {
    it("should return cursor when more results exist", async () => {
      // Mock returns limit+1 results to indicate more pages
      const results = Array.from({ length: 51 }, (_, i) => ({
        id: `u${i}`,
        name: `User ${i}`,
        image: null,
        slug: null,
        value: 5_000_000 - i * 10_000,
        earned_at: "2026-01-01T00:00:00Z",
      }));
      mockDb.getAchievementEarners.mockResolvedValueOnce(results);

      const res = await GET(
        makeGetRequest("/api/achievements/power-user/members"),
        { params: Promise.resolve({ id: "power-user" }) },
      );

      const body = await res.json();
      expect(body.members).toHaveLength(50); // Default limit
      expect(body.cursor).toBe("50"); // Next offset
    });

    it("should respect custom limit", async () => {
      const results = Array.from({ length: 11 }, (_, i) => ({
        id: `u${i}`,
        name: `User ${i}`,
        image: null,
        slug: null,
        value: 5_000_000 - i * 10_000,
        earned_at: "2026-01-01T00:00:00Z",
      }));
      mockDb.getAchievementEarners.mockResolvedValueOnce(results);

      const res = await GET(
        makeGetRequest("/api/achievements/power-user/members", { limit: "10" }),
        { params: Promise.resolve({ id: "power-user" }) },
      );

      const body = await res.json();
      expect(body.members).toHaveLength(10);
      expect(body.cursor).toBe("10");
    });

    it("should use cursor for offset in RPC call", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([]);

      await GET(
        makeGetRequest("/api/achievements/power-user/members", { cursor: "100", limit: "10" }),
        { params: Promise.resolve({ id: "power-user" }) },
      );

      // Verify the RPC was called with correct params including offset
      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
      const [, , params] = mockDb.getAchievementEarners.mock.calls[0]!;
      // Params order for power-user: [threshold, threshold, limit+1, offset]
      // Last param is offset
      expect(params[params.length - 1]).toBe(100); // offset from cursor
    });
  });

  describe("achievements with no members query", () => {
    it("should return empty array for spending achievements (not implemented)", async () => {
      const res = await GET(
        makeGetRequest("/api/achievements/big-spender/members"),
        { params: Promise.resolve({ id: "big-spender" }) },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.members).toEqual([]);
      expect(body.cursor).toBeNull();
    });

    it("should return empty array for streak achievement (not implemented)", async () => {
      const res = await GET(
        makeGetRequest("/api/achievements/streak/members"),
        { params: Promise.resolve({ id: "streak" }) },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.members).toEqual([]);
      expect(body.cursor).toBeNull();
    });
  });

  describe("different achievement types", () => {
    it("should call RPC for session-based achievements (quick-draw)", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 100, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/quick-draw/members"),
        { params: Promise.resolve({ id: "quick-draw" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
      expect(mockDb.getAchievementEarners).toHaveBeenCalledWith(
        "quick-draw",
        expect.any(String),
        expect.any(Array),
      );
    });

    it("should call RPC for diversity achievements (model-tourist)", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 5, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/model-tourist/members"),
        { params: Promise.resolve({ id: "model-tourist" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
      expect(mockDb.getAchievementEarners).toHaveBeenCalledWith(
        "model-tourist",
        expect.any(String),
        expect.any(Array),
      );
    });

    it("should call RPC for input-hog achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 1_000_000, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/input-hog/members"),
        { params: Promise.resolve({ id: "input-hog" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
      expect(mockDb.getAchievementEarners).toHaveBeenCalledWith(
        "input-hog",
        expect.any(String),
        expect.any(Array),
      );
    });

    it("should call RPC for output-addict achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 1_000_000, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/output-addict/members"),
        { params: Promise.resolve({ id: "output-addict" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for reasoning-junkie achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 500_000, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/reasoning-junkie/members"),
        { params: Promise.resolve({ id: "reasoning-junkie" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for veteran achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 30, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/veteran/members"),
        { params: Promise.resolve({ id: "veteran" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for big-day achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 100_000, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/big-day/members"),
        { params: Promise.resolve({ id: "big-day" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for cache-master achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 50, earned_at: null },
      ]);

      await GET(
        makeGetRequest("/api/achievements/cache-master/members"),
        { params: Promise.resolve({ id: "cache-master" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for tool-hoarder achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 5, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/tool-hoarder/members"),
        { params: Promise.resolve({ id: "tool-hoarder" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for device-nomad achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 3, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/device-nomad/members"),
        { params: Promise.resolve({ id: "device-nomad" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for marathon achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 10, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/marathon/members"),
        { params: Promise.resolve({ id: "marathon" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for chatterbox achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 200, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/chatterbox/members"),
        { params: Promise.resolve({ id: "chatterbox" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for session-hoarder achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 500, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/session-hoarder/members"),
        { params: Promise.resolve({ id: "session-hoarder" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for automation-addict achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 50, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/automation-addict/members"),
        { params: Promise.resolve({ id: "automation-addict" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for centurion achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 100, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/centurion/members"),
        { params: Promise.resolve({ id: "centurion" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for first-blood achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 1, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/first-blood/members"),
        { params: Promise.resolve({ id: "first-blood" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for millionaire achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 1_000_000, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/millionaire/members"),
        { params: Promise.resolve({ id: "millionaire" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should call RPC for billionaire achievement", async () => {
      mockDb.getAchievementEarners.mockResolvedValueOnce([
        { id: "u1", name: "User", image: null, slug: null, value: 1_000_000_000, earned_at: "2026-01-01T00:00:00Z" },
      ]);

      await GET(
        makeGetRequest("/api/achievements/billionaire/members"),
        { params: Promise.resolve({ id: "billionaire" }) },
      );

      expect(mockDb.getAchievementEarners).toHaveBeenCalledOnce();
    });

    it("should return empty for daily-burn (not implemented)", async () => {
      const res = await GET(
        makeGetRequest("/api/achievements/daily-burn/members"),
        { params: Promise.resolve({ id: "daily-burn" }) },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.members).toEqual([]);
      expect(body.cursor).toBeNull();
    });

    it("should return 404 for weekend-warrior (timezone-dependent)", async () => {
      const res = await GET(
        makeGetRequest("/api/achievements/weekend-warrior/members"),
        { params: Promise.resolve({ id: "weekend-warrior" }) },
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("timezone-dependent");
    });

    it("should return 404 for early-bird (timezone-dependent)", async () => {
      const res = await GET(
        makeGetRequest("/api/achievements/early-bird/members"),
        { params: Promise.resolve({ id: "early-bird" }) },
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("timezone-dependent");
    });
  });

  describe("error handling", () => {
    it("should return 500 on database error", async () => {
      mockDb.getAchievementEarners.mockRejectedValueOnce(new Error("DB connection failed"));

      const res = await GET(
        makeGetRequest("/api/achievements/power-user/members"),
        { params: Promise.resolve({ id: "power-user" }) },
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to fetch achievement members");
    });
  });
});
