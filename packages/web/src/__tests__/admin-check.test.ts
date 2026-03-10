import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

// ---------------------------------------------------------------------------
// GET /api/admin/check
// ---------------------------------------------------------------------------

describe("GET /api/admin/check", () => {
  let GET: (req: Request) => Promise<Response>;
  let mockClient: ReturnType<typeof createMockClient>;
  const ORIGINAL_ENV = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
    process.env = { ...ORIGINAL_ENV, ADMIN_EMAILS: "admin@example.com" };
    const mod = await import("@/app/api/admin/check/route");
    GET = mod.GET;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("should return isAdmin: false when not authenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost:7030/api/admin/check"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isAdmin).toBe(false);
  });

  it("should return isAdmin: true for admin user with email", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({
      userId: "u1",
      email: "admin@example.com",
    });

    const res = await GET(new Request("http://localhost:7030/api/admin/check"));
    const body = await res.json();

    expect(body.isAdmin).toBe(true);
  });

  it("should return isAdmin: false for non-admin user", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({
      userId: "u1",
      email: "user@example.com",
    });

    const res = await GET(new Request("http://localhost:7030/api/admin/check"));
    const body = await res.json();

    expect(body.isAdmin).toBe(false);
  });

  it("should fall back to D1 lookup when auth has no email", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({
      userId: "u1",
      email: undefined,
    });
    mockClient.firstOrNull.mockResolvedValueOnce({ email: "admin@example.com" });

    const res = await GET(new Request("http://localhost:7030/api/admin/check"));
    const body = await res.json();

    expect(body.isAdmin).toBe(true);
    expect(mockClient.firstOrNull).toHaveBeenCalledOnce();
  });

  it("should return isAdmin: false when D1 lookup finds no email", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({
      userId: "u1",
      email: undefined,
    });
    mockClient.firstOrNull.mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost:7030/api/admin/check"));
    const body = await res.json();

    expect(body.isAdmin).toBe(false);
  });
});
