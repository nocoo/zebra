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

const ADMIN = { userId: "admin-1", email: "admin@test.com" };

function makePost(): Request {
  return new Request("http://localhost:7020/api/admin/badges/b1/unarchive", {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// POST /api/admin/badges/[id]/unarchive
// ---------------------------------------------------------------------------

describe("POST /api/admin/badges/[id]/unarchive", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let mockDbRead: ReturnType<typeof createMockDbRead>;
  let mockDbWrite: ReturnType<typeof createMockDbWrite>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbRead = createMockDbRead();
    mockDbWrite = createMockDbWrite();
    vi.mocked(dbModule.getDbRead).mockResolvedValue(mockDbRead as never);
    vi.mocked(dbModule.getDbWrite).mockResolvedValue(mockDbWrite as never);
    const mod = await import("@/app/api/admin/badges/[id]/unarchive/route");
    POST = mod.POST;
  });

  function callPost(id: string) {
    return POST(makePost(), { params: Promise.resolve({ id }) });
  }

  it("returns 403 when not admin", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await callPost("b1");
    expect(res.status).toBe(403);
  });

  it("returns 400 when id is empty", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await callPost("");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Badge ID is required");
  });

  it("returns 404 when badge not found", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce(null);

    const res = await callPost("b1");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Badge not found");
  });

  it("returns 400 when badge is not archived", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce({ id: "b1", is_archived: 0 });

    const res = await callPost("b1");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Badge is not archived");
  });

  it("unarchives badge successfully", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce({ id: "b1", is_archived: 1 });
    mockDbWrite.execute.mockResolvedValueOnce(undefined);

    const res = await callPost("b1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDbWrite.execute).toHaveBeenCalledWith(
      expect.stringContaining("is_archived = 0"),
      ["b1"],
    );
  });

  it("returns 500 on DB error", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.getBadge.mockResolvedValueOnce({ id: "b1", is_archived: 1 });
    mockDbWrite.execute.mockRejectedValueOnce(new Error("DB down"));

    const res = await callPost("b1");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to unarchive badge");
  });
});
