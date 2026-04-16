import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDbRead, createMockDbWrite } from "./test-utils";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  getDbRead: vi.fn(),
  getDbWrite: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  resolveAdmin: vi.fn(),
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "mock-assign-id"),
}));

import * as dbModule from "@/lib/db";

const { resolveAdmin } = (await import("@/lib/admin")) as unknown as {
  resolveAdmin: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:7020/api/admin/badges/assignments");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET" });
}

function makePost(body?: unknown): Request {
  const opts: RequestInit = { method: "POST" };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { "Content-Type": "application/json" };
  }
  return new Request("http://localhost:7020/api/admin/badges/assignments", opts);
}

const ADMIN = { userId: "admin-1", email: "admin@test.com" };

const MOCK_BADGE = {
  id: "badge-1",
  text: "VIP",
  icon: "star",
  color_bg: "#3B82F6",
  color_text: "#FFFFFF",
  is_archived: 0,
};

// ---------------------------------------------------------------------------
// GET /api/admin/badges/assignments
// ---------------------------------------------------------------------------

describe("GET /api/admin/badges/assignments", () => {
  let GET: (req: Request) => Promise<Response>;
  let mockDbRead: ReturnType<typeof createMockDbRead>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbRead = createMockDbRead();
    vi.mocked(dbModule.getDbRead).mockResolvedValue(mockDbRead as never);
    const mod = await import("@/app/api/admin/badges/assignments/route");
    GET = mod.GET;
  });

  it("returns 403 when not admin", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it("returns assignments list", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const assignments = [{ id: "a1", badge_id: "b1", user_id: "u1" }];
    mockDbRead.listBadgeAssignments.mockResolvedValueOnce(assignments);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assignments).toEqual(assignments);
  });

  it("passes filter params to DB", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.listBadgeAssignments.mockResolvedValueOnce([]);

    await GET(makeGet({ badgeId: "b1", userId: "u1", status: "active", limit: "10", offset: "5" }));

    expect(mockDbRead.listBadgeAssignments).toHaveBeenCalledWith({
      badgeId: "b1",
      userId: "u1",
      status: "active",
      limit: 10,
      offset: 5,
    });
  });

  it("caps limit at 250", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.listBadgeAssignments.mockResolvedValueOnce([]);

    await GET(makeGet({ limit: "500" }));

    expect(mockDbRead.listBadgeAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 250 }),
    );
  });

  it("defaults limit to 50 and offset to 0", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.listBadgeAssignments.mockResolvedValueOnce([]);

    await GET(makeGet());

    expect(mockDbRead.listBadgeAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });

  it("returns 500 on DB error", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.listBadgeAssignments.mockRejectedValueOnce(new Error("DB down"));

    const res = await GET(makeGet());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to list badge assignments");
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/badges/assignments
// ---------------------------------------------------------------------------

describe("POST /api/admin/badges/assignments", () => {
  let POST: (req: Request) => Promise<Response>;
  let mockDbRead: ReturnType<typeof createMockDbRead>;
  let mockDbWrite: ReturnType<typeof createMockDbWrite>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbRead = createMockDbRead();
    mockDbWrite = createMockDbWrite();
    vi.mocked(dbModule.getDbRead).mockResolvedValue(mockDbRead as never);
    vi.mocked(dbModule.getDbWrite).mockResolvedValue(mockDbWrite as never);
    const mod = await import("@/app/api/admin/badges/assignments/route");
    POST = mod.POST;
  });

  it("returns 403 when not admin", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await POST(makePost({ badgeId: "b1", userId: "u1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const req = new Request("http://localhost:7020/api/admin/badges/assignments", {
      method: "POST",
      body: "bad-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 400 when badgeId is missing", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ userId: "u1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("badgeId is required");
  });

  it("returns 400 when userId is missing", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ badgeId: "b1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("userId is required");
  });

  it("returns 400 when badgeId is empty string", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ badgeId: "", userId: "u1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("badgeId is required");
  });

  it("returns 404 when badge not found", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce(null);

    const res = await POST(makePost({ badgeId: "b1", userId: "u1" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Badge not found");
  });

  it("returns 400 when badge is archived", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce({ ...MOCK_BADGE, is_archived: 1 });

    const res = await POST(makePost({ badgeId: "b1", userId: "u1" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Cannot assign archived badge");
  });

  it("returns 404 when user not found", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce(MOCK_BADGE);
    mockDbRead.getUserById.mockResolvedValueOnce(null);

    const res = await POST(makePost({ badgeId: "b1", userId: "u1" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("User not found");
  });

  it("returns 409 when user has active assignment", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce(MOCK_BADGE);
    mockDbRead.getUserById.mockResolvedValueOnce({ id: "u1" });
    mockDbRead.checkNonRevokedAssignment.mockResolvedValueOnce({ exists: true, isActive: true });

    const res = await POST(makePost({ badgeId: "b1", userId: "u1" }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("active assignment");
  });

  it("returns 409 when user has expired (non-revoked) assignment", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce(MOCK_BADGE);
    mockDbRead.getUserById.mockResolvedValueOnce({ id: "u1" });
    mockDbRead.checkNonRevokedAssignment.mockResolvedValueOnce({ exists: true, isActive: false });

    const res = await POST(makePost({ badgeId: "b1", userId: "u1" }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("expired");
  });

  it("creates assignment successfully", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce(MOCK_BADGE);
    mockDbRead.getUserById.mockResolvedValueOnce({ id: "u1" });
    mockDbRead.checkNonRevokedAssignment.mockResolvedValueOnce({ exists: false });
    mockDbWrite.execute.mockResolvedValueOnce(undefined);

    const res = await POST(makePost({ badgeId: "badge-1", userId: "u1", note: "Great work!" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assignment.id).toBe("mock-assign-id");
    expect(body.assignment.badge_id).toBe("badge-1");
    expect(body.assignment.user_id).toBe("u1");
    expect(body.assignment.snapshot_text).toBe("VIP");
    expect(body.assignment.assigned_by).toBe("admin-1");
    expect(body.assignment.note).toBe("Great work!");
    expect(body.assignment.status).toBe("active");
    expect(body.assignment.expires_at).toBeDefined();
  });

  it("creates assignment with null note when not provided", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce(MOCK_BADGE);
    mockDbRead.getUserById.mockResolvedValueOnce({ id: "u1" });
    mockDbRead.checkNonRevokedAssignment.mockResolvedValueOnce({ exists: false });
    mockDbWrite.execute.mockResolvedValueOnce(undefined);

    const res = await POST(makePost({ badgeId: "badge-1", userId: "u1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assignment.note).toBeNull();
  });

  it("returns 409 on UNIQUE constraint violation", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce(MOCK_BADGE);
    mockDbRead.getUserById.mockResolvedValueOnce({ id: "u1" });
    mockDbRead.checkNonRevokedAssignment.mockResolvedValueOnce({ exists: false });
    mockDbWrite.execute.mockRejectedValueOnce(new Error("UNIQUE constraint failed"));

    const res = await POST(makePost({ badgeId: "b1", userId: "u1" }));

    expect(res.status).toBe(409);
  });

  it("returns 500 on unexpected DB error", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce(MOCK_BADGE);
    mockDbRead.getUserById.mockResolvedValueOnce({ id: "u1" });
    mockDbRead.checkNonRevokedAssignment.mockResolvedValueOnce({ exists: false });
    mockDbWrite.execute.mockRejectedValueOnce(new Error("Connection lost"));

    const res = await POST(makePost({ badgeId: "b1", userId: "u1" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to assign badge");
  });
});
