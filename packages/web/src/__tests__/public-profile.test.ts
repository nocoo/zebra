import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/users/[slug]/route";
import * as d1Module from "@/lib/d1";

// Mock D1
vi.mock("@/lib/d1", async (importOriginal) => {
  const original = await importOriginal<typeof d1Module>();
  return {
    ...original,
    getD1Client: vi.fn(),
  };
});

function createMockClient() {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    firstOrNull: vi.fn(),
  };
}

function makeRequest(
  slug: string,
  params: Record<string, string> = {},
): [Request, { params: Promise<{ slug: string }> }] {
  const url = new URL(`http://localhost:7030/api/users/${slug}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return [
    new Request(url.toString()),
    { params: Promise.resolve({ slug }) },
  ];
}

describe("GET /api/users/[slug]", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
  });

  describe("slug validation", () => {
    it("should reject invalid slug format", async () => {
      const [req, ctx] = makeRequest("!!!invalid!!!");
      const res = await GET(req, ctx);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid profile slug");
    });

    it("should reject slug starting with hyphen", async () => {
      const [req, ctx] = makeRequest("-bad-slug");
      const res = await GET(req, ctx);

      expect(res.status).toBe(400);
    });

    it("should accept valid alphanumeric slug", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce(null);
      const [req, ctx] = makeRequest("nocoo");
      const res = await GET(req, ctx);

      // Will be 404 because user doesn't exist, not 400
      expect(res.status).toBe(404);
    });

    it("should accept slug with hyphens", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce(null);
      const [req, ctx] = makeRequest("some-user-123");
      const res = await GET(req, ctx);

      expect(res.status).toBe(404);
    });
  });

  describe("user lookup", () => {
    it("should return 404 for non-existent user", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce(null);
      const [req, ctx] = makeRequest("nobody");
      const res = await GET(req, ctx);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("User not found");
    });
  });

  describe("query params", () => {
    it("should reject invalid days param", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce({
        id: "u1",
        name: "Test",
        image: null,
        slug: "test",
        is_public: 1,
        created_at: "2026-01-01",
      });
      const [req, ctx] = makeRequest("test", { days: "0" });
      const res = await GET(req, ctx);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("days must be");
    });

    it("should reject days > 365", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce({
        id: "u1",
        name: "Test",
        image: null,
        slug: "test",
        is_public: 1,
        created_at: "2026-01-01",
      });
      const [req, ctx] = makeRequest("test", { days: "500" });
      const res = await GET(req, ctx);

      expect(res.status).toBe(400);
    });

    it("should reject invalid source", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce({
        id: "u1",
        name: "Test",
        image: null,
        slug: "test",
        is_public: 1,
        created_at: "2026-01-01",
      });
      const [req, ctx] = makeRequest("test", { source: "bad-source" });
      const res = await GET(req, ctx);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid source");
    });
  });

  describe("successful response", () => {
    const testUser = {
      id: "u1",
      name: "Test User",
      image: "https://example.com/avatar.jpg",
      slug: "testuser",
      is_public: 1,
      created_at: "2026-01-15T10:00:00Z",
    };

    it("should return user info and usage data", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce(testUser);
      mockClient.query.mockResolvedValueOnce({
        results: [
          {
            source: "claude-code",
            model: "sonnet-4",
            hour_start: "2026-03-07",
            input_tokens: 1000,
            cached_input_tokens: 200,
            output_tokens: 500,
            reasoning_output_tokens: 0,
            total_tokens: 1700,
          },
        ],
      });

      const [req, ctx] = makeRequest("testuser");
      const res = await GET(req, ctx);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.user).toEqual({
        name: "Test User",
        image: "https://example.com/avatar.jpg",
        slug: "testuser",
        created_at: "2026-01-15T10:00:00Z",
      });

      expect(body.records).toHaveLength(1);
      expect(body.summary.total_tokens).toBe(1700);
      expect(body.summary.input_tokens).toBe(1000);
    });

    it("should compute correct summary from multiple records", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce(testUser);
      mockClient.query.mockResolvedValueOnce({
        results: [
          { source: "claude-code", model: "a", hour_start: "2026-03-07", input_tokens: 100, cached_input_tokens: 10, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 160 },
          { source: "opencode", model: "b", hour_start: "2026-03-07", input_tokens: 200, cached_input_tokens: 20, output_tokens: 100, reasoning_output_tokens: 5, total_tokens: 325 },
        ],
      });

      const [req, ctx] = makeRequest("testuser");
      const res = await GET(req, ctx);
      const body = await res.json();

      expect(body.summary.input_tokens).toBe(300);
      expect(body.summary.cached_input_tokens).toBe(30);
      expect(body.summary.output_tokens).toBe(150);
      expect(body.summary.reasoning_output_tokens).toBe(5);
      expect(body.summary.total_tokens).toBe(485);
    });

    it("should filter by source when provided", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce(testUser);
      mockClient.query.mockResolvedValueOnce({ results: [] });

      const [req, ctx] = makeRequest("testuser", { source: "opencode" });
      await GET(req, ctx);

      const sqlCall = mockClient.query.mock.calls[0]!;
      expect(sqlCall[0]).toContain("source = ?");
      expect(sqlCall[1]).toContain("opencode");
    });
  });

  describe("error handling", () => {
    it("should return 500 on D1 query failure", async () => {
      mockClient.firstOrNull.mockResolvedValueOnce({
        id: "u1",
        name: "Test",
        image: null,
        slug: "test",
        is_public: 1,
        created_at: "2026-01-01",
      });
      mockClient.query.mockRejectedValueOnce(new Error("D1 down"));

      const [req, ctx] = makeRequest("test");
      const res = await GET(req, ctx);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to load profile data");
    });
  });
});
