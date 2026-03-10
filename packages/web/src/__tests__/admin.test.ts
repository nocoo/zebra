import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isAdmin, resolveAdmin } from "@/lib/admin";
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
// Tests
// ---------------------------------------------------------------------------

describe("isAdmin", () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("should return false for null/undefined email", () => {
    process.env = { ...ORIGINAL_ENV, ADMIN_EMAILS: "admin@example.com" };
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it("should return true for matching email (case insensitive)", () => {
    process.env = { ...ORIGINAL_ENV, ADMIN_EMAILS: "Admin@Example.com" };
    expect(isAdmin("admin@example.com")).toBe(true);
    expect(isAdmin("ADMIN@EXAMPLE.COM")).toBe(true);
  });

  it("should return false for non-admin email", () => {
    process.env = { ...ORIGINAL_ENV, ADMIN_EMAILS: "admin@example.com" };
    expect(isAdmin("user@example.com")).toBe(false);
  });

  it("should handle multiple comma-separated emails", () => {
    process.env = {
      ...ORIGINAL_ENV,
      ADMIN_EMAILS: "a@test.com, b@test.com , c@test.com",
    };
    expect(isAdmin("a@test.com")).toBe(true);
    expect(isAdmin("b@test.com")).toBe(true);
    expect(isAdmin("c@test.com")).toBe(true);
    expect(isAdmin("d@test.com")).toBe(false);
  });

  it("should return false when ADMIN_EMAILS is empty or unset", () => {
    process.env = { ...ORIGINAL_ENV, ADMIN_EMAILS: "" };
    expect(isAdmin("anyone@example.com")).toBe(false);

    process.env = { ...ORIGINAL_ENV };
    delete process.env.ADMIN_EMAILS;
    expect(isAdmin("anyone@example.com")).toBe(false);
  });

  it("should ignore blank entries from trailing commas", () => {
    process.env = { ...ORIGINAL_ENV, ADMIN_EMAILS: "a@test.com,,," };
    expect(isAdmin("a@test.com")).toBe(true);
    expect(isAdmin("")).toBe(false);
  });
});

describe("resolveAdmin", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(d1Module.getD1Client).mockReturnValue(
      mockClient as unknown as d1Module.D1Client,
    );
    process.env = { ...ORIGINAL_ENV, ADMIN_EMAILS: "admin@example.com" };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("should return null when not authenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce(null);

    const result = await resolveAdmin(new Request("http://localhost"));
    expect(result).toBeNull();
  });

  it("should return null when authenticated but not admin", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({
      userId: "u1",
      email: "user@example.com",
    });

    const result = await resolveAdmin(new Request("http://localhost"));
    expect(result).toBeNull();
  });

  it("should return admin result when email matches directly", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({
      userId: "u1",
      email: "admin@example.com",
    });

    const result = await resolveAdmin(new Request("http://localhost"));
    expect(result).toEqual({ userId: "u1", email: "admin@example.com" });
  });

  it("should fall back to D1 lookup when auth result has no email", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({
      userId: "u1",
      email: undefined,
    });
    mockClient.firstOrNull.mockResolvedValueOnce({ email: "admin@example.com" });

    const result = await resolveAdmin(new Request("http://localhost"));

    expect(mockClient.firstOrNull).toHaveBeenCalledWith(
      "SELECT email FROM users WHERE id = ?",
      ["u1"],
    );
    expect(result).toEqual({ userId: "u1", email: "admin@example.com" });
  });

  it("should return null when D1 lookup finds no email", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({
      userId: "u1",
      email: undefined,
    });
    mockClient.firstOrNull.mockResolvedValueOnce(null);

    const result = await resolveAdmin(new Request("http://localhost"));
    expect(result).toBeNull();
  });

  it("should return null when D1 lookup returns non-admin email", async () => {
    vi.mocked(resolveUser).mockResolvedValueOnce({
      userId: "u1",
      email: undefined,
    });
    mockClient.firstOrNull.mockResolvedValueOnce({ email: "user@example.com" });

    const result = await resolveAdmin(new Request("http://localhost"));
    expect(result).toBeNull();
  });
});
