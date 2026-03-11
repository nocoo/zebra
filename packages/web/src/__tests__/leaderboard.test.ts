import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/leaderboard/route";
import * as d1Module from "@/lib/d1";

// Mock D1
vi.mock("@/lib/d1", async (importOriginal) => {
  const original = await importOriginal<typeof d1Module>();
  return {
    ...original,
    getD1Client: vi.fn(),
  };
});

// Mock admin
vi.mock("@/lib/admin", () => ({
  resolveAdmin: vi.fn(),
}));

const { resolveAdmin } = (await import("@/lib/admin")) as unknown as {
  resolveAdmin: ReturnType<typeof vi.fn>;
};

function createMockClient() {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    firstOrNull: vi.fn(),
  };
}

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:7030/api/leaderboard");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

describe("GET /api/leaderboard", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
  });

  describe("query params validation", () => {
    it("should reject invalid period", async () => {
      const res = await GET(makeRequest({ period: "year" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid period");
    });

    it("should accept valid periods", async () => {
      for (const period of ["week", "month", "all"]) {
        mockClient.query.mockResolvedValueOnce({ results: [] });
        const res = await GET(makeRequest({ period }));
        expect(res.status).toBe(200);
      }
    });

    it("should reject limit < 1", async () => {
      const res = await GET(makeRequest({ limit: "0" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("limit must be");
    });

    it("should reject limit > 100", async () => {
      const res = await GET(makeRequest({ limit: "200" }));

      expect(res.status).toBe(400);
    });

    it("should reject non-numeric limit", async () => {
      const res = await GET(makeRequest({ limit: "abc" }));

      expect(res.status).toBe(400);
    });
  });

  describe("default behavior", () => {
    it("should default to period=week and limit=50", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.period).toBe("week");
      expect(body.entries).toEqual([]);

      // Check SQL includes date filter (week has a date condition)
      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("ur.hour_start >= ?");
    });
  });

  describe("successful response", () => {
    it("should return ranked entries with user info", async () => {
      mockClient.query.mockResolvedValueOnce({
        results: [
          {
            user_id: "u1",
            name: "Alice",
            image: "https://example.com/alice.jpg",
            slug: "alice",
            total_tokens: 5000000,
            input_tokens: 3000000,
            output_tokens: 1500000,
            cached_input_tokens: 500000,
          },
          {
            user_id: "u2",
            name: "Bob",
            image: null,
            slug: "bob",
            total_tokens: 3000000,
            input_tokens: 2000000,
            output_tokens: 800000,
            cached_input_tokens: 200000,
          },
        ],
      });

      const res = await GET(makeRequest({ period: "month" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.period).toBe("month");
      expect(body.entries).toHaveLength(2);

      expect(body.entries[0]).toEqual({
        rank: 1,
        user: {
          name: "Alice",
          image: "https://example.com/alice.jpg",
          slug: "alice",
        },
        total_tokens: 5000000,
        input_tokens: 3000000,
        output_tokens: 1500000,
        cached_input_tokens: 500000,
      });

      expect(body.entries[1].rank).toBe(2);
      expect(body.entries[1].user.name).toBe("Bob");
    });

    it("should not include date filter for period=all", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      await GET(makeRequest({ period: "all" }));

      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).not.toContain("ur.hour_start >= ?");
    });

    it("should filter by is_public = 1", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      await GET(makeRequest());

      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("u.is_public = 1");
    });

    it("should still require slug IS NOT NULL", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      await GET(makeRequest());

      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("u.slug IS NOT NULL");
    });

    it("should pass limit to SQL", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      await GET(makeRequest({ limit: "10" }));

      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("LIMIT ?");
      expect(sqlCall[1]).toContain(10);
    });
  });

  describe("error handling", () => {
    it("should return 500 on D1 failure", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("D1 down"));

      const res = await GET(makeRequest());

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to load leaderboard");
    });
  });

  describe("team filter", () => {
    it("should add team JOIN when team param is provided", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      const res = await GET(makeRequest({ team: "team-abc" }));

      expect(res.status).toBe(200);
      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("JOIN team_members tm");
      expect(sqlCall[0]).toContain("tm.team_id = ?");
      expect(sqlCall[1]).toContain("team-abc");
    });

    it("should not include slug IS NOT NULL or is_public when team is set", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      await GET(makeRequest({ team: "team-abc" }));

      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).not.toContain("u.slug IS NOT NULL");
      expect(sqlCall[0]).not.toContain("u.is_public");
    });
  });

  describe("nickname fallback", () => {
    it("should retry without nickname when first query throws 'no such column'", async () => {
      mockClient.query
        .mockRejectedValueOnce(new Error("no such column: u.nickname"))
        .mockResolvedValueOnce({ results: [] });

      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      // Fallback SQL should NOT contain u.nickname or u.is_public
      const fallbackSql = mockClient.query.mock.calls[1]![0] as string;
      expect(fallbackSql).not.toContain("u.nickname");
      expect(fallbackSql).not.toContain("u.is_public");
    });

    it("should use slug IS NOT NULL only in fallback SQL", async () => {
      mockClient.query
        .mockRejectedValueOnce(new Error("no such column: u.is_public"))
        .mockResolvedValueOnce({ results: [] });

      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      const fallbackSql = mockClient.query.mock.calls[1]![0] as string;
      expect(fallbackSql).toContain("u.slug IS NOT NULL");
      expect(fallbackSql).not.toContain("u.is_public");
    });

    it("should retry when first query throws 'no such table'", async () => {
      mockClient.query
        .mockRejectedValueOnce(new Error("no such table: team_members"))
        .mockResolvedValueOnce({ results: [] });

      const res = await GET(makeRequest({ team: "t1" }));

      expect(res.status).toBe(200);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    it("should re-throw non-column/table errors", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("connection refused"));

      const res = await GET(makeRequest());

      expect(res.status).toBe(500);
    });

    it("should use nickname when available", async () => {
      mockClient.query.mockResolvedValueOnce({
        results: [
          {
            user_id: "u1",
            name: "Alice Smith",
            nickname: "alice",
            image: null,
            slug: "alice-s",
            total_tokens: 1000,
            input_tokens: 500,
            output_tokens: 400,
            cached_input_tokens: 100,
          },
        ],
      });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.entries[0].user.name).toBe("alice");
    });

    it("should fall back to name when nickname is null", async () => {
      mockClient.query.mockResolvedValueOnce({
        results: [
          {
            user_id: "u1",
            name: "Bob Jones",
            nickname: null,
            image: null,
            slug: "bob",
            total_tokens: 1000,
            input_tokens: 500,
            output_tokens: 400,
            cached_input_tokens: 100,
          },
        ],
      });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.entries[0].user.name).toBe("Bob Jones");
    });

    it("should include fromDate in fallback when period is not all", async () => {
      mockClient.query
        .mockRejectedValueOnce(new Error("no such column: u.nickname"))
        .mockResolvedValueOnce({ results: [] });

      const res = await GET(makeRequest({ period: "month" }));

      expect(res.status).toBe(200);
      const fallbackSql = mockClient.query.mock.calls[1]![0] as string;
      expect(fallbackSql).toContain("ur.hour_start >= ?");
    });
  });

  describe("admin mode", () => {
    it("should show all users when admin=true and caller is admin", async () => {
      resolveAdmin.mockResolvedValueOnce({ userId: "admin-1", email: "a@b.com" });
      mockClient.query.mockResolvedValueOnce({ results: [] });

      const res = await GET(makeRequest({ admin: "true" }));

      expect(res.status).toBe(200);
      const sqlCall = mockClient.query.mock.calls[0]!;
      // Admin mode skips the is_public filter and slug requirement in WHERE
      expect(sqlCall[0]).not.toContain("u.is_public = 1");
      expect(sqlCall[0]).not.toContain("u.slug IS NOT NULL");
    });

    it("should NOT include is_public or slug filter in admin SQL", async () => {
      resolveAdmin.mockResolvedValueOnce({ userId: "admin-1", email: "a@b.com" });
      mockClient.query.mockResolvedValueOnce({ results: [] });

      await GET(makeRequest({ admin: "true" }));

      const sqlCall = mockClient.query.mock.calls[0]!;
      const sql = sqlCall[0] as string;
      expect(sql).not.toContain("u.is_public = 1");
      expect(sql).not.toContain("u.slug IS NOT NULL");
      // Should still have basic conditions
      expect(sql).toContain("1=1");
    });

    it("should include is_public in response entries when admin", async () => {
      resolveAdmin.mockResolvedValueOnce({ userId: "admin-1", email: "a@b.com" });
      mockClient.query.mockResolvedValueOnce({
        results: [
          {
            user_id: "u1",
            name: "Alice",
            nickname: null,
            image: null,
            slug: "alice",
            is_public: 1,
            total_tokens: 5000,
            input_tokens: 3000,
            output_tokens: 1500,
            cached_input_tokens: 500,
          },
          {
            user_id: "u2",
            name: "Bob",
            nickname: null,
            image: null,
            slug: null,
            is_public: 0,
            total_tokens: 3000,
            input_tokens: 2000,
            output_tokens: 800,
            cached_input_tokens: 200,
          },
        ],
      });

      const res = await GET(makeRequest({ admin: "true" }));
      const body = await res.json();

      expect(body.entries[0].user.is_public).toBe(true);
      expect(body.entries[1].user.is_public).toBe(false);
    });

    it("should NOT include is_public in response entries when not admin", async () => {
      mockClient.query.mockResolvedValueOnce({
        results: [
          {
            user_id: "u1",
            name: "Alice",
            nickname: null,
            image: null,
            slug: "alice",
            total_tokens: 5000,
            input_tokens: 3000,
            output_tokens: 1500,
            cached_input_tokens: 500,
          },
        ],
      });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.entries[0].user).not.toHaveProperty("is_public");
    });

    it("should apply normal filters when admin=true but caller is not admin", async () => {
      resolveAdmin.mockResolvedValueOnce(null);
      mockClient.query.mockResolvedValueOnce({ results: [] });

      const res = await GET(makeRequest({ admin: "true" }));

      expect(res.status).toBe(200);
      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("u.is_public = 1");
      expect(sqlCall[0]).toContain("u.slug IS NOT NULL");
    });

    it("should apply normal filters when admin param is not 'true'", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [] });

      const res = await GET(makeRequest({ admin: "false" }));

      expect(res.status).toBe(200);
      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("u.is_public = 1");
      expect(sqlCall[0]).toContain("u.slug IS NOT NULL");
      // Should not even call resolveAdmin
      expect(resolveAdmin).not.toHaveBeenCalled();
    });

    it("should include u.is_public in SQL SELECT when admin", async () => {
      resolveAdmin.mockResolvedValueOnce({ userId: "admin-1", email: "a@b.com" });
      mockClient.query.mockResolvedValueOnce({ results: [] });

      await GET(makeRequest({ admin: "true" }));

      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("u.is_public");
    });
  });
});
