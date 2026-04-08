import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFirstOrNull = vi.fn();

vi.mock("@/lib/db", () => ({
  getDbRead: vi.fn(() => Promise.resolve({ firstOrNull: mockFirstOrNull })),
}));

import { GET } from "@/app/api/auth/invite-required/route";

describe("GET /api/auth/invite-required", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return required=true when setting is 'true'", async () => {
    mockFirstOrNull.mockResolvedValue({ value: "true" });

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: true });
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
  });

  it("should return required=false when setting is 'false'", async () => {
    mockFirstOrNull.mockResolvedValue({ value: "false" });

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: false });
  });

  it("should return required=true when setting does not exist (null)", async () => {
    mockFirstOrNull.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: true });
  });

  it("should return required=true when table does not exist", async () => {
    mockFirstOrNull.mockRejectedValue(new Error("no such table: app_settings"));

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: true });
  });

  it("should return required=true on unexpected error (safe default)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFirstOrNull.mockRejectedValue(new Error("Connection refused"));

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: true });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should handle non-Error thrown values", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFirstOrNull.mockRejectedValue("string error");

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: true });
    consoleSpy.mockRestore();
  });
});
