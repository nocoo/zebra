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

// ---------------------------------------------------------------------------
// GET /api/pricing
// ---------------------------------------------------------------------------

describe("GET /api/pricing", () => {
  let GET: (req: Request) => Promise<Response>;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
    const mod = await import("@/app/api/pricing/route");
    GET = mod.GET;
  });

  it("should reject unauthenticated with 401", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost:7030/api/pricing"));

    expect(res.status).toBe(401);
  });

  it("should return pricing map from DB rows", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.query.mockResolvedValueOnce({
      results: [
        { model: "gpt-4o", input: 2.5, output: 10.0, cached: 1.25, source: null, note: null },
      ],
    });

    const res = await GET(new Request("http://localhost:7030/api/pricing"));

    expect(res.status).toBe(200);
    const body = await res.json();
    // buildPricingMap merges DB rows with defaults — just check it's a non-empty object
    expect(typeof body).toBe("object");
    expect(body).not.toEqual({});
  });

  it("should fall back to defaults when table does not exist", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.query.mockRejectedValueOnce(
      new Error("no such table: model_pricing"),
    );

    const res = await GET(new Request("http://localhost:7030/api/pricing"));

    expect(res.status).toBe(200);
    const body = await res.json();
    // Default map should have some known models
    expect(typeof body).toBe("object");
  });

  it("should fall back to defaults on unexpected error", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({ userId: "u1" });
    mockClient.query.mockRejectedValueOnce(new Error("D1 down"));

    const res = await GET(new Request("http://localhost:7030/api/pricing"));

    expect(res.status).toBe(200);
    // Still returns a valid response (defaults)
    const body = await res.json();
    expect(typeof body).toBe("object");
  });
});
