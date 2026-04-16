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
  nanoid: vi.fn(() => "mock-id-123"),
}));

import * as dbModule from "@/lib/db";

const { resolveAdmin } = (await import("@/lib/admin")) as unknown as {
  resolveAdmin: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGet(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:7020/api/admin/badges");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET" });
}

function makePost(body?: unknown): Request {
  const opts: RequestInit = { method: "POST" };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { "Content-Type": "application/json" };
  }
  return new Request("http://localhost:7020/api/admin/badges", opts);
}

const ADMIN = { userId: "admin-1", email: "admin@test.com" };

// ---------------------------------------------------------------------------
// GET /api/admin/badges
// ---------------------------------------------------------------------------

describe("GET /api/admin/badges", () => {
  let GET: (req: Request) => Promise<Response>;
  let mockDbRead: ReturnType<typeof createMockDbRead>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbRead = createMockDbRead();
    vi.mocked(dbModule.getDbRead).mockResolvedValue(mockDbRead as never);
    const mod = await import("@/app/api/admin/badges/route");
    GET = mod.GET;
  });

  it("returns 403 when not admin", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it("returns badges list", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const badges = [
      { id: "b1", text: "VIP", icon: "star", color_bg: "#3B82F6", color_text: "#FFFFFF", is_archived: 0 },
    ];
    mockDbRead.listBadges.mockResolvedValueOnce(badges);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.badges).toEqual(badges);
    expect(mockDbRead.listBadges).toHaveBeenCalledWith(true);
  });

  it("returns 500 on DB error", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbRead.listBadges.mockRejectedValueOnce(new Error("DB down"));

    const res = await GET(makeGet());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to list badges");
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/badges
// ---------------------------------------------------------------------------

describe("POST /api/admin/badges", () => {
  let POST: (req: Request) => Promise<Response>;
  let mockDbWrite: ReturnType<typeof createMockDbWrite>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbWrite = createMockDbWrite();
    vi.mocked(dbModule.getDbWrite).mockResolvedValue(mockDbWrite as never);
    const mod = await import("@/app/api/admin/badges/route");
    POST = mod.POST;
  });

  it("returns 403 when not admin", async () => {
    resolveAdmin.mockResolvedValueOnce(null);
    const res = await POST(makePost({ text: "VIP", icon: "star", palette: "ocean" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const req = new Request("http://localhost:7020/api/admin/badges", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 400 when text is missing", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ icon: "star", palette: "ocean" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when text is too long", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ text: "ABCD", icon: "star", palette: "ocean" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("text must be 1-3 characters");
  });

  it("returns 400 when text contains HTML", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ text: "<b>", icon: "star", palette: "ocean" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("text contains invalid characters");
  });

  it("returns 400 for invalid icon", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ text: "VIP", icon: "banana", palette: "ocean" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid icon");
  });

  it("returns 400 for invalid palette", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ text: "VIP", icon: "star", palette: "nope" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid palette");
  });

  it("returns 400 for invalid hex colors", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ text: "VIP", icon: "star", colorBg: "red", colorText: "blue" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("colorBg and colorText must be valid hex");
  });

  it("returns 400 when no color info provided", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ text: "VIP", icon: "star" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Either palette or colorBg/colorText are required");
  });

  it("creates badge with palette", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbWrite.execute.mockResolvedValueOnce(undefined);

    const res = await POST(makePost({ text: "VIP", icon: "star", palette: "ocean", description: "A VIP badge" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.badge.id).toBe("mock-id-123");
    expect(body.badge.text).toBe("VIP");
    expect(body.badge.icon).toBe("star");
    expect(body.badge.color_bg).toBe("#3B82F6");
    expect(body.badge.color_text).toBe("#FFFFFF");
    expect(body.badge.description).toBe("A VIP badge");
    expect(body.badge.is_archived).toBe(0);
  });

  it("creates badge with hex colors", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbWrite.execute.mockResolvedValueOnce(undefined);

    const res = await POST(makePost({ text: "Hi", icon: "heart", colorBg: "#ff0000", colorText: "#ffffff" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.badge.color_bg).toBe("#FF0000");
    expect(body.badge.color_text).toBe("#FFFFFF");
  });

  it("creates badge with null description when not provided", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbWrite.execute.mockResolvedValueOnce(undefined);

    const res = await POST(makePost({ text: "Hi", icon: "star", palette: "gold" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.badge.description).toBeNull();
  });

  it("returns 500 on DB write error", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    mockDbWrite.execute.mockRejectedValueOnce(new Error("Write failed"));

    const res = await POST(makePost({ text: "VIP", icon: "star", palette: "ocean" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create badge");
  });

  it("returns 400 when text is not a string", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ text: 123, icon: "star", palette: "ocean" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("text must be a string");
  });

  it("returns 400 when text is empty after trimming", async () => {
    resolveAdmin.mockResolvedValueOnce(ADMIN);
    const res = await POST(makePost({ text: "   ", icon: "star", palette: "ocean" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("text is required");
  });
});
