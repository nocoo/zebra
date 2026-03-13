import { describe, it, expect, vi, beforeEach } from "vitest";
import * as d1Module from "@/lib/d1";

// Mock D1
vi.mock("@/lib/d1", async (importOriginal) => {
  const original = await importOriginal<typeof d1Module>();
  return {
    ...original,
    getD1Client: vi.fn(),
  };
});

// Mock resolveUser
vi.mock("@/lib/auth-helpers", () => ({
  resolveUser: vi.fn(),
}));

const { resolveUser } = (await import("@/lib/auth-helpers")) as unknown as {
  resolveUser: ReturnType<typeof vi.fn>;
};

function createMockClient() {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    firstOrNull: vi.fn(),
  };
}

const EMPTY_SUMMARY = {
  total_count: 0,
  total_duration_seconds: 0,
  total_user_messages: 0,
  total_assistant_messages: 0,
  total_messages: 0,
};

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:7030/api/sessions");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

describe("GET /api/sessions", () => {
  let GET: (req: Request) => Promise<Response>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
    const mod = await import("@/app/api/sessions/route");
    GET = mod.GET;
  });

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  describe("authentication", () => {
    it("should reject unauthenticated requests with 401", async () => {
      vi.mocked(resolveUser).mockResolvedValueOnce(null);

      const res = await GET(makeRequest());

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
      mockClient.query
        .mockResolvedValueOnce({ results: [], meta: {} })
        .mockResolvedValueOnce({ results: [EMPTY_SUMMARY], meta: {} });

      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      const [sql, params] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("WHERE");
      expect(sql).toContain("user_id = ?");
      expect(sql).toContain("started_at >= ?");
      expect(sql).toContain("started_at < ?");
      expect(params![0]).toBe("u1");
    });

    it("should accept custom from/to date range", async () => {
      mockClient.query
        .mockResolvedValueOnce({ results: [], meta: {} })
        .mockResolvedValueOnce({ results: [EMPTY_SUMMARY], meta: {} });

      const res = await GET(
        makeRequest({ from: "2026-03-01", to: "2026-03-07" }),
      );

      expect(res.status).toBe(200);
      const [, params] = mockClient.query.mock.calls[0]!;
      expect(params![1]).toBe("2026-03-01T00:00:00.000Z");
      expect(params![2]).toBe("2026-03-07T00:00:00.000Z");
    });

    it("should filter by source", async () => {
      mockClient.query
        .mockResolvedValueOnce({ results: [], meta: {} })
        .mockResolvedValueOnce({ results: [EMPTY_SUMMARY], meta: {} });

      const res = await GET(makeRequest({ source: "claude-code" }));

      expect(res.status).toBe(200);
      const [sql, params] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("source = ?");
      expect(params).toContain("claude-code");
    });

    it("should reject invalid source filter", async () => {
      const res = await GET(makeRequest({ source: "invalid-tool" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("source");
    });

    it("should filter by kind", async () => {
      mockClient.query
        .mockResolvedValueOnce({ results: [], meta: {} })
        .mockResolvedValueOnce({ results: [EMPTY_SUMMARY], meta: {} });

      const res = await GET(makeRequest({ kind: "human" }));

      expect(res.status).toBe(200);
      const [sql, params] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("kind = ?");
      expect(params).toContain("human");
    });

    it("should reject invalid kind filter", async () => {
      const res = await GET(makeRequest({ kind: "invalid" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("kind");
    });

    it("should reject invalid date format for from", async () => {
      const res = await GET(makeRequest({ from: "not-a-date" }));

      expect(res.status).toBe(400);
    });

    it("should reject invalid date format for to", async () => {
      const res = await GET(makeRequest({ to: "xyz" }));

      expect(res.status).toBe(400);
    });

    it("should filter by project name via HAVING on p.name", async () => {
      mockClient.query
        .mockResolvedValueOnce({ results: [], meta: {} })
        .mockResolvedValueOnce({ results: [EMPTY_SUMMARY], meta: {} });

      const res = await GET(makeRequest({ project: "pew" }));

      expect(res.status).toBe(200);
      const [sql, params] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("p.name = ?");
      expect(params).toContain("pew");
    });

    it("should filter for unassigned sessions when project=_unassigned", async () => {
      mockClient.query
        .mockResolvedValueOnce({ results: [], meta: {} })
        .mockResolvedValueOnce({ results: [EMPTY_SUMMARY], meta: {} });

      const res = await GET(makeRequest({ project: "_unassigned" }));

      expect(res.status).toBe(200);
      const [sql] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("p.name IS NULL");
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
      mockClient.query
        .mockResolvedValueOnce({
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
        })
        .mockResolvedValueOnce({
          results: [
            {
              total_count: 2,
              total_duration_seconds: 4500,
              total_user_messages: 20,
              total_assistant_messages: 17,
              total_messages: 43,
            },
          ],
          meta: {},
        });

      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.records).toHaveLength(2);
      expect(body.records[0].source).toBe("claude-code");
      expect(body.records[1].source).toBe("opencode");
    });

    it("should include summary stats", async () => {
      mockClient.query
        .mockResolvedValueOnce({
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
        })
        .mockResolvedValueOnce({
          results: [
            {
              total_count: 2,
              total_duration_seconds: 4500,
              total_user_messages: 20,
              total_assistant_messages: 17,
              total_messages: 43,
            },
          ],
          meta: {},
        });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.summary).toBeDefined();
      expect(body.summary.total_sessions).toBe(2);
      expect(body.summary.total_duration_seconds).toBe(4500);
      expect(body.summary.total_user_messages).toBe(20);
      expect(body.summary.total_assistant_messages).toBe(17);
      expect(body.summary.total_messages).toBe(43);
    });

    it("should return empty records when no data", async () => {
      mockClient.query
        .mockResolvedValueOnce({ results: [], meta: {} })
        .mockResolvedValueOnce({ results: [EMPTY_SUMMARY], meta: {} });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.records).toEqual([]);
      expect(body.summary.total_sessions).toBe(0);
      expect(body.summary.total_duration_seconds).toBe(0);
    });

    it("should order by started_at DESC", async () => {
      mockClient.query
        .mockResolvedValueOnce({ results: [], meta: {} })
        .mockResolvedValueOnce({ results: [EMPTY_SUMMARY], meta: {} });

      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      const [sql] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("ORDER BY");
      expect(sql).toContain("started_at DESC");
    });

    it("should apply a protective LIMIT to the SQL query", async () => {
      mockClient.query
        .mockResolvedValueOnce({ results: [], meta: {} })
        .mockResolvedValueOnce({ results: [EMPTY_SUMMARY], meta: {} });

      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      const [sql] = mockClient.query.mock.calls[0]!;
      expect(sql).toContain("LIMIT");
    });

    it("should return 500 on D1 error", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("D1 down"));

      const res = await GET(makeRequest());

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("session");
    });
  });

  // -----------------------------------------------------------------------
  // Truncation metadata
  // -----------------------------------------------------------------------

  describe("truncation metadata", () => {
    beforeEach(() => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: "u1",
        email: "test@example.com",
      });
    });

    it("should return truncated=false and total_count when results fit within limit", async () => {
      const records = Array.from({ length: 3 }, (_, i) => ({
        session_key: `k${i}`,
        source: "claude-code",
        kind: "human",
        started_at: "2026-03-08T10:00:00Z",
        last_message_at: "2026-03-08T10:30:00Z",
        duration_seconds: 600,
        user_messages: 5,
        assistant_messages: 4,
        total_messages: 10,
        project_ref: null,
        project_name: null,
        model: null,
      }));

      // First call: the records query; second call: the summary query
      mockClient.query
        .mockResolvedValueOnce({ results: records, meta: {} })
        .mockResolvedValueOnce({
          results: [
            {
              total_count: 3,
              total_duration_seconds: 1800,
              total_user_messages: 15,
              total_assistant_messages: 12,
              total_messages: 30,
            },
          ],
          meta: {},
        });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.truncated).toBe(false);
      expect(body.total_count).toBe(3);
    });

    it("should return truncated=true when results hit MAX_ROWS limit", async () => {
      // Simulate exactly MAX_ROWS (5000) records returned — means there are likely more
      const records = Array.from({ length: 5000 }, (_, i) => ({
        session_key: `k${i}`,
        source: "claude-code",
        kind: "human",
        started_at: "2026-03-08T10:00:00Z",
        last_message_at: "2026-03-08T10:30:00Z",
        duration_seconds: 60,
        user_messages: 2,
        assistant_messages: 2,
        total_messages: 4,
        project_ref: null,
        project_name: null,
        model: null,
      }));

      mockClient.query
        .mockResolvedValueOnce({ results: records, meta: {} })
        .mockResolvedValueOnce({
          results: [
            {
              total_count: 7500,
              total_duration_seconds: 450000,
              total_user_messages: 15000,
              total_assistant_messages: 15000,
              total_messages: 30000,
            },
          ],
          meta: {},
        });

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.truncated).toBe(true);
      expect(body.total_count).toBe(7500);
      expect(body.records).toHaveLength(5000);
    });

    it("should compute summary from the summary query, not from truncated records", async () => {
      // 2 records returned (truncated from a larger set for simplicity)
      const records = [
        {
          session_key: "k0",
          source: "claude-code",
          kind: "human",
          started_at: "2026-03-08T10:00:00Z",
          last_message_at: "2026-03-08T10:30:00Z",
          duration_seconds: 1800,
          user_messages: 12,
          assistant_messages: 10,
          total_messages: 25,
          project_ref: null,
          project_name: null,
          model: null,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ results: records, meta: {} })
        .mockResolvedValueOnce({
          results: [
            {
              total_count: 100,
              total_duration_seconds: 180000,
              total_user_messages: 1200,
              total_assistant_messages: 1000,
              total_messages: 2500,
            },
          ],
          meta: {},
        });

      const res = await GET(makeRequest());
      const body = await res.json();

      // Summary should reflect the full dataset, not just the 1 returned record
      expect(body.summary.total_sessions).toBe(100);
      expect(body.summary.total_duration_seconds).toBe(180000);
      expect(body.summary.total_user_messages).toBe(1200);
      expect(body.summary.total_assistant_messages).toBe(1000);
      expect(body.summary.total_messages).toBe(2500);
    });
  });
});
