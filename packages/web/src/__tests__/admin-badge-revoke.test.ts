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

import * as dbModule from "@/lib/db";

const { resolveAdmin } = (await import("@/lib/admin")) as unknown as {
  resolveAdmin: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(body?: unknown): Request {
  const opts: RequestInit = { method: "POST" };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { "Content-Type": "application/json" };
  }
  return new Request("http://localhost:7020/api/admin/badges/assignments/a1/revoke", opts);
}

const ADMIN = { userId: "admin-1", email: "admin@test.com" };

// ---------------------------------------------------------------------------
// POST /api/admin/badges/assignments/[id]/revoke
// ---------------------------------------------------------------------------

describe("POST /api/admin/badges/assignments/[id]/revoke", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let mockDbRead: ReturnType<typeof createMockDbRead>;
  let mockDbWrite: ReturnType<typeof createMockDbWrite>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbRead = createMockDbRead();
    mockDbWrite = createMockDbWrite();
    vi.mocked(dbModule.getDbRead).mockResolvedValue(mockDbRead as never);
    vi.mocked(dbModule.getDbWrite).mockResolvedValue(mockDbWrite as never);
    const mod = await import("@/app/api/admin/badges/assignments/[id]/revoke/route");
    POST = mod.POST;
  });

  function callPost(id: string, body?: unknown) {
    return POST(makePost(body), { params: Promise.resolve({ id }) });
  }

  it("returns 403 when not admin", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await callPost("a1");
    expect(res.status).toBe(403);
  });

  it("returns 400 when id is empty", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await callPost("");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Assignment ID is required");
  });

  it("returns 404 when assignment not found", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadgeAssignment.mockResolvedValueOnce(null);

    const res = await callPost("a1");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Assignment not found");
  });

  it("returns 400 when assignment already revoked", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadgeAssignment.mockResolvedValueOnce({
      id: "a1",
      revoked_at: "2026-01-01T00:00:00Z",
    });

    const res = await callPost("a1");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Assignment is already revoked");
  });

  it("revokes assignment successfully without reason", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadgeAssignment.mockResolvedValueOnce({
      id: "a1",
      revoked_at: null,
    });
    mockDbWrite.execute.mockResolvedValueOnce(undefined);

    const res = await callPost("a1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.revokedAt).toBeDefined();
    expect(mockDbWrite.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE badge_assignments"),
      expect.arrayContaining(["admin-1", null, "a1"]),
    );
  });

  it("revokes assignment with reason", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadgeAssignment.mockResolvedValueOnce({
      id: "a1",
      revoked_at: null,
    });
    mockDbWrite.execute.mockResolvedValueOnce(undefined);

    const res = await callPost("a1", { reason: "Violation" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDbWrite.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE badge_assignments"),
      expect.arrayContaining(["Violation"]),
    );
  });

  it("handles missing body gracefully (no reason)", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadgeAssignment.mockResolvedValueOnce({
      id: "a1",
      revoked_at: null,
    });
    mockDbWrite.execute.mockResolvedValueOnce(undefined);

    // Request with no body at all
    const req = new Request("http://localhost:7020/api/admin/badges/assignments/a1/revoke", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 500 on DB error", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadgeAssignment.mockResolvedValueOnce({
      id: "a1",
      revoked_at: null,
    });
    mockDbWrite.execute.mockRejectedValueOnce(new Error("DB down"));

    const res = await callPost("a1");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to revoke badge assignment");
  });
});
