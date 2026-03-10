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

function makeJson(method: string, body?: unknown): Request {
  const opts: RequestInit = { method };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { "Content-Type": "application/json" };
  }
  return new Request("http://localhost:7030/api/teams", opts);
}

// ---------------------------------------------------------------------------
// GET /api/teams
// ---------------------------------------------------------------------------

describe("GET /api/teams", () => {
  let GET: (req: Request) => Promise<Response>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
    const mod = await import("@/app/api/teams/route");
    GET = mod.GET;
  });

  it("should reject unauthenticated with 401", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce(null);

    const res = await GET(makeJson("GET"));

    expect(res.status).toBe(401);
  });

  it("should return teams list", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.query.mockResolvedValueOnce({
      results: [
        {
          id: "t1",
          name: "Team Alpha",
          slug: "team-alpha",
          invite_code: "abc12345",
          created_by: "u1",
          created_at: "2026-01-01T00:00:00Z",
          member_count: 3,
        },
      ],
    });

    const res = await GET(makeJson("GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.teams).toHaveLength(1);
    expect(body.teams[0].name).toBe("Team Alpha");
  });

  it("should return empty array when teams table does not exist", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.query.mockRejectedValueOnce(new Error("no such table: teams"));

    const res = await GET(makeJson("GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.teams).toEqual([]);
  });

  it("should return 500 on unexpected error", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.query.mockRejectedValueOnce(new Error("D1 down"));

    const res = await GET(makeJson("GET"));

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/teams
// ---------------------------------------------------------------------------

describe("POST /api/teams", () => {
  let POST: (req: Request) => Promise<Response>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
    // Deterministic UUIDs for testing
    let callIdx = 0;
    const uuids = [
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "11111111-2222-3333-4444-555555555555",
      "66666666-7777-8888-9999-000000000000",
    ];
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => uuids[callIdx++ % uuids.length]!,
    );
    const mod = await import("@/app/api/teams/route");
    POST = mod.POST;
  });

  it("should reject unauthenticated with 401", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce(null);

    const res = await POST(makeJson("POST", { name: "My Team" }));

    expect(res.status).toBe(401);
  });

  it("should reject invalid JSON", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });

    const res = await POST(
      new Request("http://localhost:7030/api/teams", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("should reject empty name", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });

    const res = await POST(makeJson("POST", { name: "" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("1-64 characters");
  });

  it("should reject name longer than 64 chars", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });

    const res = await POST(makeJson("POST", { name: "a".repeat(65) }));

    expect(res.status).toBe(400);
  });

  it("should create a team with auto-generated slug (201)", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockResolvedValueOnce(null); // slug not taken
    mockClient.execute.mockResolvedValue({ changes: 1 });

    const res = await POST(makeJson("POST", { name: "My Cool Team!" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.name).toBe("My Cool Team!");
    expect(body.slug).toBe("my-cool-team"); // auto slugified
    expect(body.member_count).toBe(1);
    expect(body.invite_code).toBeTruthy();
    // Should have 2 execute calls: INSERT teams + INSERT team_members
    expect(mockClient.execute).toHaveBeenCalledTimes(2);
  });

  it("should append random suffix when slug is taken", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockResolvedValueOnce({ id: "existing" }); // slug taken
    mockClient.execute.mockResolvedValue({ changes: 1 });

    const res = await POST(makeJson("POST", { name: "Taken" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    // slug should be "taken-" + 6 random chars from UUID
    expect(body.slug).toMatch(/^taken-[a-f0-9]{6}$/);
  });

  it("should use 'team' as fallback slug for non-alphanumeric names", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockResolvedValueOnce(null);
    mockClient.execute.mockResolvedValue({ changes: 1 });

    const res = await POST(makeJson("POST", { name: "---" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.slug).toBe("team");
  });

  it("should return 503 when teams table does not exist", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockResolvedValueOnce(null);
    mockClient.execute.mockRejectedValueOnce(new Error("no such table: teams"));

    const res = await POST(makeJson("POST", { name: "Test" }));

    expect(res.status).toBe(503);
  });
});
