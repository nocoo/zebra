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

function makeJson(body?: unknown): Request {
  const opts: RequestInit = { method: "POST" };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { "Content-Type": "application/json" };
  }
  return new Request("http://localhost:7030/api/teams/join", opts);
}

// ---------------------------------------------------------------------------
// POST /api/teams/join
// ---------------------------------------------------------------------------

describe("POST /api/teams/join", () => {
  let POST: (req: Request) => Promise<Response>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
    const mod = await import("@/app/api/teams/join/route");
    POST = mod.POST;
  });

  it("should reject unauthenticated with 401", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce(null);

    const res = await POST(makeJson({ invite_code: "abc" }));

    expect(res.status).toBe(401);
  });

  it("should reject invalid JSON", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });

    const res = await POST(
      new Request("http://localhost:7030/api/teams/join", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it("should reject missing invite_code", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });

    const res = await POST(makeJson({}));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("invite_code is required");
  });

  it("should reject empty invite_code", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });

    const res = await POST(makeJson({ invite_code: "" }));

    expect(res.status).toBe(400);
  });

  it("should reject non-string invite_code", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });

    const res = await POST(makeJson({ invite_code: 123 }));

    expect(res.status).toBe(400);
  });

  it("should return 404 for invalid invite code", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockResolvedValueOnce(null); // no team found

    const res = await POST(makeJson({ invite_code: "bad-code" }));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("Invalid invite code");
  });

  it("should return 409 when already a member", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull
      .mockResolvedValueOnce({ id: "t1", name: "Team", slug: "team" }) // team found
      .mockResolvedValueOnce({ id: "m1" }); // already a member

    const res = await POST(makeJson({ invite_code: "valid-code" }));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Already a member");
  });

  it("should join team successfully", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull
      .mockResolvedValueOnce({ id: "t1", name: "Team Alpha", slug: "team-alpha" })
      .mockResolvedValueOnce(null); // not yet a member
    mockClient.execute.mockResolvedValueOnce({ changes: 1 });

    const res = await POST(makeJson({ invite_code: "valid-code" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.team_id).toBe("t1");
    expect(body.team_name).toBe("Team Alpha");
    expect(body.team_slug).toBe("team-alpha");
    // Verify the INSERT was called with role: member
    const [sql] = mockClient.execute.mock.calls[0]!;
    expect(sql).toContain("'member'");
  });

  it("should return 503 when teams table does not exist", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockRejectedValueOnce(new Error("no such table: teams"));

    const res = await POST(makeJson({ invite_code: "abc" }));

    expect(res.status).toBe(503);
  });

  it("should return 500 on unexpected error", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.firstOrNull.mockRejectedValueOnce(new Error("D1 down"));

    const res = await POST(makeJson({ invite_code: "abc" }));

    expect(res.status).toBe(500);
  });
});
