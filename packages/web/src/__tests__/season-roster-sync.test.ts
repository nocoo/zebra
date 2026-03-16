import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/d1", () => ({
  getD1Client: vi.fn(),
}));

import { syncSeasonRosters, syncAllRostersForSeason } from "@/lib/season-roster";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    firstOrNull: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("syncSeasonRosters", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  it("should no-op when team has no registered active seasons", async () => {
    mockClient.query.mockResolvedValueOnce({ results: [] });

    await syncSeasonRosters(mockClient as never, "team-1");

    // Only the initial query, no further calls
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.execute).not.toHaveBeenCalled();
  });

  it("should no-op when allow_roster_changes=0 (filtered out by query)", async () => {
    // The query filters for allow_roster_changes = 1, so if the season
    // has it disabled, it won't appear in results
    mockClient.query.mockResolvedValueOnce({ results: [] });

    await syncSeasonRosters(mockClient as never, "team-1");

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.execute).not.toHaveBeenCalled();
  });

  it("should add new members when active season allows roster changes", async () => {
    // Active season with roster changes enabled
    mockClient.query
      .mockResolvedValueOnce({ results: [{ season_id: "season-1" }] })
      // Current team members
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }, { user_id: "user-2" }, { user_id: "user-3" }] })
      // Existing season roster (only user-1)
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }] });

    mockClient.execute.mockResolvedValue({ changes: 1, duration: 0.01 });

    await syncSeasonRosters(mockClient as never, "team-1");

    // Should have 3 queries: active seasons, team members, season members
    expect(mockClient.query).toHaveBeenCalledTimes(3);

    // Should INSERT user-2 and user-3 (not user-1 since already in roster)
    const insertCalls = mockClient.execute.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes("INSERT OR IGNORE"),
    );
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]![1]).toContain("user-2");
    expect(insertCalls[1]![1]).toContain("user-3");
  });

  it("should remove departed members when active season allows roster changes", async () => {
    mockClient.query
      .mockResolvedValueOnce({ results: [{ season_id: "season-1" }] })
      // Current team members (only user-1 remains)
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }] })
      // Existing season roster (user-1 and user-2)
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }, { user_id: "user-2" }] });

    mockClient.execute.mockResolvedValue({ changes: 1, duration: 0.01 });

    await syncSeasonRosters(mockClient as never, "team-1");

    // Should DELETE user-2 (departed from team)
    const deleteCalls = mockClient.execute.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes("DELETE"),
    );
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]![1]).toContain("user-2");
  });

  it("should handle INSERT OR IGNORE silently for UNIQUE conflicts", async () => {
    mockClient.query
      .mockResolvedValueOnce({ results: [{ season_id: "season-1" }] })
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }, { user_id: "user-2" }] })
      .mockResolvedValueOnce({ results: [] });

    // INSERT OR IGNORE returns changes=0 when UNIQUE constraint fires
    mockClient.execute.mockResolvedValue({ changes: 0, duration: 0.01 });

    // Should not throw
    await syncSeasonRosters(mockClient as never, "team-1");

    const insertCalls = mockClient.execute.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes("INSERT OR IGNORE"),
    );
    expect(insertCalls).toHaveLength(2);
  });

  it("should process multiple active seasons", async () => {
    mockClient.query
      .mockResolvedValueOnce({
        results: [{ season_id: "season-1" }, { season_id: "season-2" }],
      })
      // Current team members
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }] })
      // Season 1 roster (empty)
      .mockResolvedValueOnce({ results: [] })
      // Season 2 roster (empty)
      .mockResolvedValueOnce({ results: [] });

    mockClient.execute.mockResolvedValue({ changes: 1, duration: 0.01 });

    await syncSeasonRosters(mockClient as never, "team-1");

    // 1 (active seasons) + 1 (team members) + 2 (season rosters)
    expect(mockClient.query).toHaveBeenCalledTimes(4);

    // 2 INSERTs (user-1 into each season)
    const insertCalls = mockClient.execute.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes("INSERT OR IGNORE"),
    );
    expect(insertCalls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// syncAllRostersForSeason
// ---------------------------------------------------------------------------

describe("syncAllRostersForSeason", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  it("should return 0 when no teams are registered", async () => {
    mockClient.query.mockResolvedValueOnce({ results: [] });

    const count = await syncAllRostersForSeason(mockClient as never, "season-1");

    expect(count).toBe(0);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.execute).not.toHaveBeenCalled();
  });

  it("should add missing members for a single team", async () => {
    mockClient.query
      // season_teams
      .mockResolvedValueOnce({ results: [{ team_id: "team-1" }] })
      // current team_members for team-1
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }, { user_id: "user-2" }] })
      // existing season_team_members for team-1
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }] });

    mockClient.execute.mockResolvedValue({ changes: 1, duration: 0.01 });

    const count = await syncAllRostersForSeason(mockClient as never, "season-1");

    expect(count).toBe(1);

    // Should INSERT user-2 only
    const insertCalls = mockClient.execute.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes("INSERT OR IGNORE"),
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]![1]).toContain("user-2");
  });

  it("should remove departed members", async () => {
    mockClient.query
      .mockResolvedValueOnce({ results: [{ team_id: "team-1" }] })
      // current team has only user-1
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }] })
      // season roster has user-1 and user-2
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }, { user_id: "user-2" }] });

    mockClient.execute.mockResolvedValue({ changes: 1, duration: 0.01 });

    const count = await syncAllRostersForSeason(mockClient as never, "season-1");

    expect(count).toBe(1);

    const deleteCalls = mockClient.execute.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes("DELETE"),
    );
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]![1]).toContain("user-2");
  });

  it("should handle multiple teams", async () => {
    mockClient.query
      .mockResolvedValueOnce({
        results: [{ team_id: "team-1" }, { team_id: "team-2" }],
      })
      // team-1 members
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }] })
      // team-1 season roster (empty → needs add)
      .mockResolvedValueOnce({ results: [] })
      // team-2 members
      .mockResolvedValueOnce({ results: [{ user_id: "user-3" }, { user_id: "user-4" }] })
      // team-2 season roster (has user-3 already)
      .mockResolvedValueOnce({ results: [{ user_id: "user-3" }] });

    mockClient.execute.mockResolvedValue({ changes: 1, duration: 0.01 });

    const count = await syncAllRostersForSeason(mockClient as never, "season-1");

    expect(count).toBe(2);

    // 1 (season_teams) + 2 (team members) + 2 (season rosters) = 5
    expect(mockClient.query).toHaveBeenCalledTimes(5);

    // 2 INSERTs: user-1 into team-1, user-4 into team-2
    const insertCalls = mockClient.execute.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes("INSERT OR IGNORE"),
    );
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]![1]).toContain("user-1");
    expect(insertCalls[1]![1]).toContain("user-4");
  });

  it("should no-op when rosters are already in sync", async () => {
    mockClient.query
      .mockResolvedValueOnce({ results: [{ team_id: "team-1" }] })
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }] })
      .mockResolvedValueOnce({ results: [{ user_id: "user-1" }] });

    const count = await syncAllRostersForSeason(mockClient as never, "season-1");

    expect(count).toBe(1);
    expect(mockClient.execute).not.toHaveBeenCalled();
  });
});
