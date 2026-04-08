import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSettingsRpc,
  type GetAppSettingRequest,
  type GetAllAppSettingsRequest,
  type GetUserSettingRequest,
  type GetAllUserSettingsRequest,
} from "./settings";
import type { D1Database } from "@cloudflare/workers-types";

// ---------------------------------------------------------------------------
// Mock D1Database
// ---------------------------------------------------------------------------

function createMockDb() {
  return {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    all: vi.fn(),
  } as unknown as D1Database & {
    prepare: ReturnType<typeof vi.fn>;
    bind: ReturnType<typeof vi.fn>;
    first: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
  };
}

describe("settings RPC handlers", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // settings.getApp
  // -------------------------------------------------------------------------

  describe("settings.getApp", () => {
    it("should return app setting value", async () => {
      db.first.mockResolvedValue({ value: "10" });

      const request: GetAppSettingRequest = {
        method: "settings.getApp",
        key: "max_team_members",
      };
      const response = await handleSettingsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: "10" });
    });

    it("should return null when setting not found", async () => {
      db.first.mockResolvedValue(null);

      const request: GetAppSettingRequest = {
        method: "settings.getApp",
        key: "nonexistent",
      };
      const response = await handleSettingsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: null });
    });

    it("should return 400 when key missing", async () => {
      const request = {
        method: "settings.getApp",
        key: "",
      } as GetAppSettingRequest;
      const response = await handleSettingsRpc(request, db);

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // settings.getAllApp
  // -------------------------------------------------------------------------

  describe("settings.getAllApp", () => {
    it("should return all app settings", async () => {
      const mockSettings = [
        { key: "feature_flag_1", value: "true" },
        { key: "max_team_members", value: "10" },
      ];
      db.all.mockResolvedValue({ results: mockSettings });

      const request: GetAllAppSettingsRequest = { method: "settings.getAllApp" };
      const response = await handleSettingsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: mockSettings });
    });
  });

  // -------------------------------------------------------------------------
  // settings.getUser
  // -------------------------------------------------------------------------

  describe("settings.getUser", () => {
    it("should return user setting value", async () => {
      db.first.mockResolvedValue({ value: "dark" });

      const request: GetUserSettingRequest = {
        method: "settings.getUser",
        userId: "u1",
        key: "theme",
      };
      const response = await handleSettingsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: "dark" });
    });

    it("should return null when setting not found", async () => {
      db.first.mockResolvedValue(null);

      const request: GetUserSettingRequest = {
        method: "settings.getUser",
        userId: "u1",
        key: "nonexistent",
      };
      const response = await handleSettingsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: null });
    });

    it("should return 400 when params missing", async () => {
      const request = {
        method: "settings.getUser",
        userId: "",
        key: "theme",
      } as GetUserSettingRequest;
      const response = await handleSettingsRpc(request, db);

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // settings.getAllUser
  // -------------------------------------------------------------------------

  describe("settings.getAllUser", () => {
    it("should return all user settings", async () => {
      const mockSettings = [
        { key: "notifications", value: "enabled" },
        { key: "theme", value: "dark" },
      ];
      db.all.mockResolvedValue({ results: mockSettings });

      const request: GetAllUserSettingsRequest = {
        method: "settings.getAllUser",
        userId: "u1",
      };
      const response = await handleSettingsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: mockSettings });
    });

    it("should return 400 when userId missing", async () => {
      const request = {
        method: "settings.getAllUser",
        userId: "",
      } as GetAllUserSettingsRequest;
      const response = await handleSettingsRpc(request, db);

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown method
  // -------------------------------------------------------------------------

  describe("unknown method", () => {
    it("should return 400 for unknown method", async () => {
      const request = { method: "settings.unknown" } as unknown as GetAppSettingRequest;
      const response = await handleSettingsRpc(request, db);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain("Unknown settings method");
    });
  });
});
