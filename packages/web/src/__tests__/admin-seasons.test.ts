import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be before imports that trigger the module chain
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  getDbRead: vi.fn(),
  getDbWrite: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  resolveAdmin: vi.fn(),
}));

vi.mock("@/lib/season-roster", () => ({
  syncAllRostersForSeason: vi.fn(),
}));

vi.mock("@/auth", () => ({
  shouldUseSecureCookies: vi.fn(() => false),
}));

import { GET, POST } from "@/app/api/admin/seasons/route";
import { PATCH } from "@/app/api/admin/seasons/[seasonId]/route";
import { createMockDbRead, createMockDbWrite } from "./test-utils";
import * as dbModule from "@/lib/db";

const { resolveAdmin } = (await import("@/lib/admin")) as unknown as {
  resolveAdmin: ReturnType<typeof vi.fn>;
};

const { syncAllRostersForSeason } = (await import(
  "@/lib/season-roster"
)) as unknown as {
  syncAllRostersForSeason: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  url = "http://localhost:7030/api/admin/seasons",
  body?: unknown
): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

const ADMIN = { userId: "admin-1", email: "admin@test.com" };

// ---------------------------------------------------------------------------
// GET /api/admin/seasons
// ---------------------------------------------------------------------------

describe("GET /api/admin/seasons", () => {
  let mockDbRead: ReturnType<typeof createMockDbRead>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRead = createMockDbRead();
    vi.mocked(dbModule.getDbRead).mockResolvedValue(mockDbRead as never);
  });

  it("should return all seasons with computed status", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    // A season in the future → upcoming
    mockDbRead.query.mockResolvedValueOnce({
      results: [
        {
          id: "s1",
          name: "Season 1",
          slug: "s1",
          start_date: "2099-01-01T00:00:00Z",
          end_date: "2099-12-31T23:59:00Z",
          created_at: "2026-01-01T00:00:00Z",
          team_count: 3,
        },
      ],
    });

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.seasons).toHaveLength(1);
    expect(json.seasons[0].status).toBe("upcoming");
    expect(json.seasons[0].team_count).toBe(3);
  });

  it("should reject non-admin users", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Forbidden");
  });

  it("should handle no-such-table gracefully", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.query.mockRejectedValueOnce(new Error("no such table: seasons"));

    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toContain("not yet migrated");
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/seasons
// ---------------------------------------------------------------------------

describe("POST /api/admin/seasons", () => {
  let mockDbRead: ReturnType<typeof createMockDbRead>;
  let mockDbWrite: ReturnType<typeof createMockDbWrite>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRead = createMockDbRead();
    mockDbWrite = createMockDbWrite();
    vi.mocked(dbModule.getDbRead).mockResolvedValue(mockDbRead as never);
    vi.mocked(dbModule.getDbWrite).mockResolvedValue(mockDbWrite as never);
  });

  it("should create season with valid data", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.firstOrNull.mockResolvedValueOnce(null); // no slug collision
    mockDbWrite.execute.mockResolvedValueOnce({ changes: 1, duration: 0.01 });

    const res = await POST(
      makeRequest("POST", undefined, {
        name: "Season 1",
        slug: "s1",
        start_date: "2099-04-01T00:00:00Z",
        end_date: "2099-04-30T23:59:00Z",
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("Season 1");
    expect(json.slug).toBe("s1");
    expect(json.status).toBe("upcoming");
  });

  it("should reject duplicate slug", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.firstOrNull.mockResolvedValueOnce({ id: "existing-id" }); // slug exists

    const res = await POST(
      makeRequest("POST", undefined, {
        name: "Season 2",
        slug: "s1",
        start_date: "2099-05-01T00:00:00Z",
        end_date: "2099-05-31T23:59:00Z",
      })
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("slug already exists");
  });

  it("should reject end_date < start_date", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    const res = await POST(
      makeRequest("POST", undefined, {
        name: "Bad Season",
        slug: "bad",
        start_date: "2099-05-01T00:00:00Z",
        end_date: "2099-04-30T23:59:00Z",
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("end_date must be >= start_date");
  });

  it("should reject invalid date format", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    const res = await POST(
      makeRequest("POST", undefined, {
        name: "Bad Date",
        slug: "bad-date",
        start_date: "not-a-date",
        end_date: "2099-04-30T23:59:00Z",
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("start_date must be ISO 8601 UTC format");
  });

  it("should reject non-admin users", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await POST(
      makeRequest("POST", undefined, {
        name: "Season 1",
        slug: "s1",
        start_date: "2099-04-01T00:00:00Z",
        end_date: "2099-04-30T23:59:00Z",
      })
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/seasons/[seasonId]
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/seasons/[seasonId]", () => {
  let mockDbRead: ReturnType<typeof createMockDbRead>;
  let mockDbWrite: ReturnType<typeof createMockDbWrite>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRead = createMockDbRead();
    mockDbWrite = createMockDbWrite();
    vi.mocked(dbModule.getDbRead).mockResolvedValue(mockDbRead as never);
    vi.mocked(dbModule.getDbWrite).mockResolvedValue(mockDbWrite as never);
  });

  const patchParams = Promise.resolve({ seasonId: "season-1" });

  it("should allow name change on active season", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    const today = new Date().toISOString().slice(0, 10);
    mockDbRead.firstOrNull
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Old Name",
        slug: "s1",
        start_date: "2020-01-01T00:00:00Z",
        end_date: "2099-12-31T23:59:00Z",
      })
      .mockResolvedValueOnce({
        id: "season-1",
        name: "New Name",
        slug: "s1",
        start_date: "2020-01-01T00:00:00Z",
        end_date: "2099-12-31T23:59:00Z",
        created_at: "2020-01-01T00:00:00Z",
        updated_at: today,
      });
    mockDbWrite.execute.mockResolvedValueOnce({ changes: 1, duration: 0.01 });

    const res = await PATCH(
      makeRequest("PATCH", undefined, { name: "New Name" }),
      { params: patchParams }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("New Name");
    expect(json.status).toBe("active");
  });

  it("should allow date change on upcoming season", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    mockDbRead.firstOrNull
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Future Season",
        slug: "s-future",
        start_date: "2099-06-01T00:00:00Z",
        end_date: "2099-06-30T23:59:00Z",
      })
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Future Season",
        slug: "s-future",
        start_date: "2099-07-01T00:00:00Z",
        end_date: "2099-07-31T23:59:00Z",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-03-11T00:00:00Z",
      });
    mockDbWrite.execute.mockResolvedValueOnce({ changes: 1, duration: 0.01 });

    const res = await PATCH(
      makeRequest("PATCH", undefined, {
        start_date: "2099-07-01T00:00:00Z",
        end_date: "2099-07-31T23:59:00Z",
      }),
      { params: patchParams }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.start_date).toBe("2099-07-01T00:00:00Z");
    expect(json.status).toBe("upcoming");
  });

  it("should reject date change on active season", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    mockDbRead.firstOrNull.mockResolvedValueOnce({
      id: "season-1",
      name: "Active Season",
      slug: "s-active",
      start_date: "2020-01-01T00:00:00Z",
      end_date: "2099-12-31T23:59:00Z",
    });

    const res = await PATCH(
      makeRequest("PATCH", undefined, { start_date: "2020-02-01T00:00:00Z" }),
      { params: patchParams }
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Cannot modify dates");
  });

  it("should reject date change on ended season", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    mockDbRead.firstOrNull.mockResolvedValueOnce({
      id: "season-1",
      name: "Ended Season",
      slug: "s-ended",
      start_date: "2020-01-01T00:00:00Z",
      end_date: "2020-12-31T23:59:00Z",
    });

    const res = await PATCH(
      makeRequest("PATCH", undefined, { end_date: "2021-01-31T23:59:00Z" }),
      { params: patchParams }
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Cannot modify dates");
  });

  it("should return 404 for non-existent season", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.firstOrNull.mockResolvedValueOnce(null);

    const res = await PATCH(
      makeRequest("PATCH", undefined, { name: "Ghost" }),
      { params: patchParams }
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Season not found");
  });

  it("should trigger roster backfill when allow_roster_changes flips 0→1 on active season", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    mockDbRead.firstOrNull
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Active Season",
        slug: "s-active",
        start_date: "2020-01-01T00:00:00Z",
        end_date: "2099-12-31T23:59:00Z",
        allow_roster_changes: 0,
      })
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Active Season",
        slug: "s-active",
        start_date: "2020-01-01T00:00:00Z",
        end_date: "2099-12-31T23:59:00Z",
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
        allow_late_registration: 0,
        allow_roster_changes: 1,
        allow_late_withdrawal: 0,
      });
    mockDbWrite.execute.mockResolvedValue({ changes: 1, duration: 0.01 });
    syncAllRostersForSeason.mockResolvedValueOnce(2);

    const res = await PATCH(
      makeRequest("PATCH", undefined, { allow_roster_changes: true }),
      { params: patchParams }
    );
    expect(res.status).toBe(200);
    expect(syncAllRostersForSeason).toHaveBeenCalledWith(mockDbRead, mockDbWrite, "season-1");
  });

  it("should NOT trigger roster backfill when toggle stays on (1→1)", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    mockDbRead.firstOrNull
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Active Season",
        slug: "s-active",
        start_date: "2020-01-01T00:00:00Z",
        end_date: "2099-12-31T23:59:00Z",
        allow_roster_changes: 1,
      })
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Active Season",
        slug: "s-active",
        start_date: "2020-01-01T00:00:00Z",
        end_date: "2099-12-31T23:59:00Z",
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
        allow_late_registration: 0,
        allow_roster_changes: 1,
        allow_late_withdrawal: 0,
      });
    mockDbWrite.execute.mockResolvedValue({ changes: 1, duration: 0.01 });

    const res = await PATCH(
      makeRequest("PATCH", undefined, { allow_roster_changes: true }),
      { params: patchParams }
    );
    expect(res.status).toBe(200);
    expect(syncAllRostersForSeason).not.toHaveBeenCalled();
  });

  it("should NOT trigger roster backfill on upcoming season even with 0→1 toggle", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    mockDbRead.firstOrNull
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Future Season",
        slug: "s-future",
        start_date: "2099-06-01T00:00:00Z",
        end_date: "2099-06-30T23:59:00Z",
        allow_roster_changes: 0,
      })
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Future Season",
        slug: "s-future",
        start_date: "2099-06-01T00:00:00Z",
        end_date: "2099-06-30T23:59:00Z",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
        allow_late_registration: 0,
        allow_roster_changes: 1,
        allow_late_withdrawal: 0,
      });
    mockDbWrite.execute.mockResolvedValue({ changes: 1, duration: 0.01 });

    const res = await PATCH(
      makeRequest("PATCH", undefined, { allow_roster_changes: true }),
      { params: patchParams }
    );
    expect(res.status).toBe(200);
    expect(syncAllRostersForSeason).not.toHaveBeenCalled();
  });

  it("should trigger roster backfill when dates change upcoming→active AND roster_changes flips 0→1", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);

    // Season is upcoming before the PATCH (dates in the future)
    mockDbRead.firstOrNull
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Transition Season",
        slug: "s-trans",
        start_date: "2099-06-01T00:00:00Z",
        end_date: "2099-06-30T23:59:00Z",
        allow_roster_changes: 0,
      })
      .mockResolvedValueOnce({
        id: "season-1",
        name: "Transition Season",
        slug: "s-trans",
        start_date: "2020-01-01T00:00:00Z",
        end_date: "2099-12-31T23:59:00Z",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-03-16T00:00:00Z",
        allow_late_registration: 0,
        allow_roster_changes: 1,
        allow_late_withdrawal: 0,
      });
    mockDbWrite.execute.mockResolvedValue({ changes: 1, duration: 0.01 });
    syncAllRostersForSeason.mockResolvedValueOnce(1);

    // PATCH changes dates to make it active AND enables roster changes
    const res = await PATCH(
      makeRequest("PATCH", undefined, {
        start_date: "2020-01-01T00:00:00Z",
        end_date: "2099-12-31T23:59:00Z",
        allow_roster_changes: true,
      }),
      { params: patchParams }
    );
    expect(res.status).toBe(200);
    expect(syncAllRostersForSeason).toHaveBeenCalledWith(mockDbRead, mockDbWrite, "season-1");
  });
});
