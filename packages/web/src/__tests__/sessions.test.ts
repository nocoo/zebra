import { describe, it, expect, vi, beforeEach } from "vitest";
import * as dbModule from "@/lib/db";
import { createMockClient, makeGetRequest } from "./test-utils";

// Mock DB
vi.mock("@/lib/db", () => ({
  getDbRead: vi.fn(),
  getDbWrite: vi.fn(),
  resetDb: vi.fn(),
}));

// Mock resolveUser
vi.mock("@/lib/auth-helpers", () => ({
  resolveUser: vi.fn(),
}));

const { resolveUser } = (await import("@/lib/auth-helpers")) as unknown as {
  resolveUser: ReturnType<typeof vi.fn>;
};

describe("GET /api/sessions", () => {
  let GET: (req: Request) => Promise<Response>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(dbModule.getDbRead).mockResolvedValue(mockClient as any);
    const mod = await import("@/app/api/sessions/route");
    GET = mod.GET;
  });

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  describe("authentication", () => {
    it("should reject unauthenticated requests with 401", async () => {
      vi.mocked(resolveUser).mockResolvedValueOnce(null);

      const res = await GET(makeGetRequest("/api/sessions"));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });
  });

  // -----------------------------------------------------------------------
  // Query params
  // -----------------------------------------------------------------------

  describe("query params", () => {
    beforeEach(() => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: "u1",
        email: "test@example.com",
      });
    });

    it("should query with default date range (last 30 days)", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [], meta: {} });

      const res = await GET(makeGetRequest("/api/sessions"));

      expect(res.status).toBe(200);
      expect(mockClient.query).toHaveBeenCalledOnce();
      const [sql, params] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("WHERE");
      expect(sql).toContain("user_id = ?");
      expect(sql).toContain("started_at >= ?");
      expect(sql).toContain("started_at < ?");
      expect(params![0]).toBe("u1");
    });

    it("should accept custom from/to date range", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [], meta: {} });

      const res = await GET(
        makeGetRequest("/api/sessions", { from: "2026-03-01", to: "2026-03-07" }),
      );

      expect(res.status).toBe(200);
      const [, params] = mockClient.query.mock.calls[0]!;
      expect(params![1]).toBe("2026-03-01T00:00:00.000Z");
      // Bare-date `to` is treated as inclusive: bumped +1 day for `< toDate`
      expect(params![2]).toBe("2026-03-08T00:00:00.000Z");
    });

    it("should filter by source", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [], meta: {} });

      const res = await GET(makeGetRequest("/api/sessions", { source: "claude-code" }));

      expect(res.status).toBe(200);
      const [sql, params] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("source = ?");
      expect(params).toContain("claude-code");
    });

    it("should reject invalid source filter", async () => {
      const res = await GET(makeGetRequest("/api/sessions", { source: "invalid-tool" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("source");
    });

    it("should filter by kind", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [], meta: {} });

      const res = await GET(makeGetRequest("/api/sessions", { kind: "human" }));

      expect(res.status).toBe(200);
      const [sql, params] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("kind = ?");
      expect(params).toContain("human");
    });

    it("should reject invalid kind filter", async () => {
      const res = await GET(makeGetRequest("/api/sessions", { kind: "invalid" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("kind");
    });

    it("should reject invalid date format for from", async () => {
      const res = await GET(makeGetRequest("/api/sessions", { from: "not-a-date" }));

      expect(res.status).toBe(400);
    });

    it("should reject invalid date format for to", async () => {
      const res = await GET(makeGetRequest("/api/sessions", { to: "xyz" }));

      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // Response format
  // -----------------------------------------------------------------------

  describe("response format", () => {
    beforeEach(() => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: "u1",
        email: "test@example.com",
      });
    });

    it("should return session records", async () => {
      mockClient.query.mockResolvedValueOnce({
        results: [
          {
            session_key: "claude-code:abc",
            source: "claude-code",
            kind: "human",
            started_at: "2026-03-08T10:00:00Z",
            last_message_at: "2026-03-08T10:30:00Z",
            duration_seconds: 1800,
            user_messages: 12,
            assistant_messages: 10,
            total_messages: 25,
            project_ref: "a1b2",
            model: "claude-sonnet-4-20250514",
          },
          {
            session_key: "opencode:def",
            source: "opencode",
            kind: "human",
            started_at: "2026-03-08T11:00:00Z",
            last_message_at: "2026-03-08T11:45:00Z",
            duration_seconds: 2700,
            user_messages: 8,
            assistant_messages: 7,
            total_messages: 18,
            project_ref: null,
            model: "o3",
          },
        ],
        meta: {},
      });

      const res = await GET(makeGetRequest("/api/sessions"));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.records).toHaveLength(2);
      expect(body.records[0].source).toBe("claude-code");
      expect(body.records[1].source).toBe("opencode");
    });

    it("should include summary stats", async () => {
      mockClient.query.mockResolvedValueOnce({
        results: [
          {
            session_key: "claude-code:abc",
            source: "claude-code",
            kind: "human",
            started_at: "2026-03-08T10:00:00Z",
            last_message_at: "2026-03-08T10:30:00Z",
            duration_seconds: 1800,
            user_messages: 12,
            assistant_messages: 10,
            total_messages: 25,
            project_ref: "a1b2",
            model: "claude-sonnet-4-20250514",
          },
          {
            session_key: "opencode:def",
            source: "opencode",
            kind: "human",
            started_at: "2026-03-08T11:00:00Z",
            last_message_at: "2026-03-08T11:45:00Z",
            duration_seconds: 2700,
            user_messages: 8,
            assistant_messages: 7,
            total_messages: 18,
            project_ref: null,
            model: "o3",
          },
        ],
        meta: {},
      });

      const res = await GET(makeGetRequest("/api/sessions"));
      const body = await res.json();

      expect(body.summary).toBeDefined();
      expect(body.summary.total_sessions).toBe(2);
      expect(body.summary.total_duration_seconds).toBe(4500);
      expect(body.summary.total_user_messages).toBe(20);
      expect(body.summary.total_assistant_messages).toBe(17);
      expect(body.summary.total_messages).toBe(43);
    });

    it("should return empty records when no data", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [], meta: {} });

      const res = await GET(makeGetRequest("/api/sessions"));
      const body = await res.json();

      expect(body.records).toEqual([]);
      expect(body.summary.total_sessions).toBe(0);
      expect(body.summary.total_duration_seconds).toBe(0);
    });

    it("should order by started_at DESC", async () => {
      mockClient.query.mockResolvedValueOnce({ results: [], meta: {} });

      const res = await GET(makeGetRequest("/api/sessions"));

      expect(res.status).toBe(200);
      const [sql] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("ORDER BY");
      expect(sql).toContain("started_at DESC");
    });

    it("should return 500 on D1 error", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("D1 down"));

      const res = await GET(makeGetRequest("/api/sessions"));

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("session");
    });
  });
});
