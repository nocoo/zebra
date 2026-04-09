import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleAdminRpc,
  type ListAuditLogsRequest,
  type GetAuditLogRequest,
  type GetSystemStatsRequest,
  type ListAdminUsersRequest,
  type GetAdminUserRequest,
  type CountUsersRequest,
  type GetStorageStatsRequest,
} from "./admin";
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

describe("admin RPC handlers", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // admin.listAuditLogs
  // -------------------------------------------------------------------------

  describe("admin.listAuditLogs", () => {
    it("should return empty array (audit_logs table does not exist)", async () => {
      const request: ListAuditLogsRequest = {
        method: "admin.listAuditLogs",
      };
      const response = await handleAdminRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: [] });
      // Should NOT query DB since table doesn't exist
      expect(db.prepare).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // admin.getAuditLog
  // -------------------------------------------------------------------------

  describe("admin.getAuditLog", () => {
    it("should return null (audit_logs table does not exist)", async () => {
      const request: GetAuditLogRequest = {
        method: "admin.getAuditLog",
        logId: "al1",
      };
      const response = await handleAdminRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: null });
    });

    it("should return 400 when logId missing", async () => {
      const request = {
        method: "admin.getAuditLog",
        logId: "",
      } as GetAuditLogRequest;
      const response = await handleAdminRpc(request, db);

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // admin.getSystemStats
  // -------------------------------------------------------------------------

  describe("admin.getSystemStats", () => {
    it("should return system stats", async () => {
      const mockStats = {
        total_users: 1000,
        total_sessions: 50000,
        total_tokens: 100000000,
        active_users_24h: 150,
      };
      db.first.mockResolvedValue(mockStats);

      const request: GetSystemStatsRequest = {
        method: "admin.getSystemStats",
      };
      const response = await handleAdminRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: mockStats });
    });
  });

  // -------------------------------------------------------------------------
  // admin.listUsers
  // -------------------------------------------------------------------------

  describe("admin.listUsers", () => {
    it("should return list of users", async () => {
      const mockUsers = [
        {
          id: "u1",
          name: "alice",
          email: "alice@example.com",
          created_at: "2026-01-01T00:00:00Z",
        },
      ];
      db.all.mockResolvedValue({ results: mockUsers });

      const request: ListAdminUsersRequest = {
        method: "admin.listUsers",
      };
      const response = await handleAdminRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: mockUsers });
    });

    it("should filter by query", async () => {
      db.all.mockResolvedValue({ results: [] });

      const request: ListAdminUsersRequest = {
        method: "admin.listUsers",
        query: "alice",
      };
      await handleAdminRpc(request, db);

      expect(db.prepare).toHaveBeenCalled();
    });

    it("should support pagination", async () => {
      db.all.mockResolvedValue({ results: [] });

      const request: ListAdminUsersRequest = {
        method: "admin.listUsers",
        limit: 10,
        offset: 20,
      };
      await handleAdminRpc(request, db);

      expect(db.prepare).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // admin.getUser
  // -------------------------------------------------------------------------

  describe("admin.getUser", () => {
    it("should return user by ID", async () => {
      const mockUser = {
        id: "u1",
        name: "alice",
        email: "alice@example.com",
        created_at: "2026-01-01T00:00:00Z",
      };
      db.first.mockResolvedValue(mockUser);

      const request: GetAdminUserRequest = {
        method: "admin.getUser",
        userId: "u1",
      };
      const response = await handleAdminRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: mockUser });
    });

    it("should return 400 when userId missing", async () => {
      const request = {
        method: "admin.getUser",
        userId: "",
      } as GetAdminUserRequest;
      const response = await handleAdminRpc(request, db);

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // admin.countUsers
  // -------------------------------------------------------------------------

  describe("admin.countUsers", () => {
    it("should return user count", async () => {
      db.first.mockResolvedValue({ count: 1000 });

      const request: CountUsersRequest = {
        method: "admin.countUsers",
      };
      const response = await handleAdminRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: 1000 });
    });

    it("should return 0 when no result", async () => {
      db.first.mockResolvedValue(null);

      const request: CountUsersRequest = {
        method: "admin.countUsers",
      };
      const response = await handleAdminRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // admin.getStorageStats
  // -------------------------------------------------------------------------

  describe("admin.getStorageStats", () => {
    it("should return per-user storage stats", async () => {
      const mockUsers = [
        {
          user_id: "u1",
          slug: "alice",
          email: "alice@example.com",
          name: "Alice",
          image: null,
          team_count: 2,
          device_count: 3,
          total_tokens: 1000000,
          tokens_7d: 100000,
          tokens_30d: 500000,
          usage_row_count: 100,
          session_count: 50,
          total_messages: 200,
          total_duration_seconds: 3600,
          first_seen: "2026-01-01T00:00:00Z",
          last_seen: "2026-04-06T00:00:00Z",
        },
        {
          user_id: "u2",
          slug: "bob",
          email: "bob@example.com",
          name: "Bob",
          image: null,
          team_count: 1,
          device_count: 1,
          total_tokens: 500000,
          tokens_7d: 50000,
          tokens_30d: 200000,
          usage_row_count: 50,
          session_count: 25,
          total_messages: 100,
          total_duration_seconds: 1800,
          first_seen: "2026-02-01T00:00:00Z",
          last_seen: "2026-04-05T00:00:00Z",
        },
      ];
      db.all.mockResolvedValue({ results: mockUsers });

      const request: GetStorageStatsRequest = {
        method: "admin.getStorageStats",
      };
      const response = await handleAdminRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: mockUsers });
    });

    it("should return empty array when no users with data", async () => {
      db.all.mockResolvedValue({ results: [] });

      const request: GetStorageStatsRequest = {
        method: "admin.getStorageStats",
      };
      const response = await handleAdminRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: [] });
    });
  });

  // -------------------------------------------------------------------------
  // Unknown method
  // -------------------------------------------------------------------------

  describe("unknown method", () => {
    it("should return 400 for unknown method", async () => {
      const request = { method: "admin.unknown" } as unknown as ListAuditLogsRequest;
      const response = await handleAdminRpc(request, db);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain("Unknown admin method");
    });
  });
});
