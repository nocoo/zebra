import { describe, it, expect, vi, beforeEach } from "vitest";
import * as d1Module from "@/lib/d1";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/d1", async (importOriginal) => {
  const original = await importOriginal<typeof d1Module>();
  return { ...original, getD1Client: vi.fn() };
});

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

function makeRequest(method: string): Request {
  return new Request("http://localhost:7030/api/teams/t1", { method });
}

function makeParams(teamId = "t1") {
  return { params: Promise.resolve({ teamId }) };
}

// ---------------------------------------------------------------------------
// GET /api/teams/[teamId]
// ---------------------------------------------------------------------------

describe("GET /api/teams/[teamId]", () => {
  let GET: (req: Request, ctx: { params: Promise<{ teamId: string }> }) => Promise<Response>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
    const mod = await import("@/app/api/teams/[teamId]/route");
    GET = mod.GET;
  });

  it("should reject unauthenticated with 401", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce(null);

    const res = await GET(makeRequest("GET"), makeParams());

    expect(res.status).toBe(401);
  });

  it("should return 403 when user is not a member", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockResolvedValueOnce(null); // no membership

    const res = await GET(makeRequest("GET"), makeParams());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("Not a member");
  });

  it("should return 404 when team not found", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull
      .mockResolvedValueOnce({ role: "member" }) // membership exists
      .mockResolvedValueOnce(null); // team not found

    const res = await GET(makeRequest("GET"), makeParams());

    expect(res.status).toBe(404);
  });

  it("should return team details with members", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull
      .mockResolvedValueOnce({ role: "owner" })
      .mockResolvedValueOnce({
        id: "t1",
        name: "Team Alpha",
        slug: "team-alpha",
        invite_code: "abc12345",
        created_at: "2026-01-01T00:00:00Z",
      });
    mockClient.query.mockResolvedValueOnce({
      results: [
        {
          user_id: "u1",
          name: "Alice",
          nickname: "ali",
          image: null,
          role: "owner",
          joined_at: "2026-01-01T00:00:00Z",
        },
        {
          user_id: "u2",
          name: "Bob",
          nickname: null,
          image: "https://example.com/bob.png",
          role: "member",
          joined_at: "2026-01-02T00:00:00Z",
        },
      ],
    });

    const res = await GET(makeRequest("GET"), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("Team Alpha");
    expect(body.role).toBe("owner");
    expect(body.members).toHaveLength(2);
    // nickname takes precedence over name
    expect(body.members[0].name).toBe("ali");
    expect(body.members[1].name).toBe("Bob"); // falls back to name
  });

  it("should fall back when nickname column does not exist", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull
      .mockResolvedValueOnce({ role: "member" })
      .mockResolvedValueOnce({
        id: "t1",
        name: "Team",
        slug: "team",
        invite_code: "x",
        created_at: "2026-01-01T00:00:00Z",
      });
    // First query fails (no such column), fallback query succeeds
    mockClient.query
      .mockRejectedValueOnce(new Error("no such column: nickname"))
      .mockResolvedValueOnce({
        results: [
          {
            user_id: "u1",
            name: "Alice",
            image: null,
            role: "owner",
            joined_at: "2026-01-01T00:00:00Z",
          },
        ],
      });

    const res = await GET(makeRequest("GET"), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    // nickname should be null in fallback, so name field uses u.name
    expect(body.members[0].name).toBe("Alice");
  });

  it("should return 503 when teams table does not exist", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockRejectedValueOnce(
      new Error("no such table: team_members"),
    );

    const res = await GET(makeRequest("GET"), makeParams());

    expect(res.status).toBe(503);
  });

  it("should return 500 on unexpected error in GET", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockRejectedValueOnce(new Error("D1 boom"));

    const res = await GET(makeRequest("GET"), makeParams());

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/teams/[teamId] — leave team
// ---------------------------------------------------------------------------

describe("DELETE /api/teams/[teamId]", () => {
  let DELETE: (req: Request, ctx: { params: Promise<{ teamId: string }> }) => Promise<Response>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
    const mod = await import("@/app/api/teams/[teamId]/route");
    DELETE = mod.DELETE;
  });

  it("should reject unauthenticated with 401", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce(null);

    const res = await DELETE(makeRequest("DELETE"), makeParams());

    expect(res.status).toBe(401);
  });

  it("should return 403 when user is not a member", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockResolvedValueOnce(null); // no membership

    const res = await DELETE(makeRequest("DELETE"), makeParams());

    expect(res.status).toBe(403);
  });

  it("should prevent owner from leaving when other members exist", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull
      .mockResolvedValueOnce({ role: "owner" }) // membership
      .mockResolvedValueOnce({ cnt: 3 }); // 3 members

    const res = await DELETE(makeRequest("DELETE"), makeParams());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Transfer ownership");
  });

  it("should allow non-owner to leave (team persists)", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u2" });
    mockClient.firstOrNull
      .mockResolvedValueOnce({ role: "member" }) // not owner
      .mockResolvedValueOnce({ cnt: 3 }); // 3 members
    mockClient.execute.mockResolvedValue({ changes: 1 });

    const res = await DELETE(makeRequest("DELETE"), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // Should only delete membership, NOT the team
    expect(mockClient.execute).toHaveBeenCalledTimes(1);
    expect(mockClient.execute.mock.calls[0]![0]).toContain("DELETE FROM team_members");
  });

  it("should delete team when last member leaves", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull
      .mockResolvedValueOnce({ role: "owner" })
      .mockResolvedValueOnce({ cnt: 1 }); // last member
    mockClient.execute.mockResolvedValue({ changes: 1 });

    const res = await DELETE(makeRequest("DELETE"), makeParams());

    expect(res.status).toBe(200);
    // Should delete membership + team
    expect(mockClient.execute).toHaveBeenCalledTimes(2);
    expect(mockClient.execute.mock.calls[0]![0]).toContain("DELETE FROM team_members");
    expect(mockClient.execute.mock.calls[1]![0]).toContain("DELETE FROM teams");
  });

  it("should return 503 when teams table does not exist (DELETE)", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockRejectedValueOnce(
      new Error("no such table: team_members"),
    );

    const res = await DELETE(makeRequest("DELETE"), makeParams());

    expect(res.status).toBe(503);
  });

  it("should return 500 on unexpected error in DELETE", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockRejectedValueOnce(new Error("D1 boom"));

    const res = await DELETE(makeRequest("DELETE"), makeParams());

    expect(res.status).toBe(500);
  });
});
