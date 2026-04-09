import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAppSetting = vi.fn();

vi.mock("@/lib/db", () => ({
  getDbRead: vi.fn(() => Promise.resolve({ getAppSetting: mockGetAppSetting })),
}));

import { GET } from "@/app/api/auth/invite-required/route";

describe("GET /api/auth/invite-required", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return required=true when setting is 'true'", async () => {
    mockGetAppSetting.mockResolvedValue("true");

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: true });
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
  });

  it("should return required=false when setting is 'false'", async () => {
    mockGetAppSetting.mockResolvedValue("false");

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: false });
  });

  it("should return required=true when setting does not exist (null)", async () => {
    mockGetAppSetting.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: true });
  });

  it("should return required=true when table does not exist", async () => {
    mockGetAppSetting.mockRejectedValue(new Error("no such table: app_settings"));

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: true });
  });

  it("should return required=true on unexpected error (safe default)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAppSetting.mockRejectedValue(new Error("Connection refused"));

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ required: true });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
