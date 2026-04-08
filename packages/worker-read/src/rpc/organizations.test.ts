import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleOrganizationsRpc,
  type ListOrganizationsRequest,
  type ListUserOrganizationsRequest,
  type GetOrganizationByIdRequest,
  type CheckOrgMembershipRequest,
  type ListOrgMembersRequest,
} from "./organizations";
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

describe("organizations RPC handlers", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // -------------------------------------------------------------------------
  // organizations.list
  // -------------------------------------------------------------------------

  describe("organizations.list", () => {
    it("should return list of organizations", async () => {
      const mockOrgs = [
        { id: "o1", name: "Org 1", slug: "org-1", created_at: "2026-01-01T00:00:00Z" },
        { id: "o2", name: "Org 2", slug: "org-2", created_at: "2026-02-01T00:00:00Z" },
      ];
      db.all.mockResolvedValue({ results: mockOrgs });

      const request: ListOrganizationsRequest = { method: "organizations.list" };
      const response = await handleOrganizationsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: mockOrgs });
    });
  });

  // -------------------------------------------------------------------------
  // organizations.listForUser
  // -------------------------------------------------------------------------

  describe("organizations.listForUser", () => {
    it("should return user's organizations", async () => {
      const mockOrgs = [
        { id: "o1", name: "Org 1", slug: "org-1", created_at: "2026-01-01T00:00:00Z" },
      ];
      db.all.mockResolvedValue({ results: mockOrgs });

      const request: ListUserOrganizationsRequest = {
        method: "organizations.listForUser",
        userId: "u1",
      };
      const response = await handleOrganizationsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: mockOrgs });
    });

    it("should return 400 when userId missing", async () => {
      const request = {
        method: "organizations.listForUser",
        userId: "",
      } as ListUserOrganizationsRequest;
      const response = await handleOrganizationsRpc(request, db);

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // organizations.getById
  // -------------------------------------------------------------------------

  describe("organizations.getById", () => {
    it("should return organization by ID", async () => {
      const mockOrg = { id: "o1", name: "Org 1", slug: "org-1", created_at: "2026-01-01T00:00:00Z" };
      db.first.mockResolvedValue(mockOrg);

      const request: GetOrganizationByIdRequest = {
        method: "organizations.getById",
        orgId: "o1",
      };
      const response = await handleOrganizationsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: mockOrg });
    });

    it("should return null when not found", async () => {
      db.first.mockResolvedValue(null);

      const request: GetOrganizationByIdRequest = {
        method: "organizations.getById",
        orgId: "nonexistent",
      };
      const response = await handleOrganizationsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: null });
    });

    it("should return 400 when orgId missing", async () => {
      const request = {
        method: "organizations.getById",
        orgId: "",
      } as GetOrganizationByIdRequest;
      const response = await handleOrganizationsRpc(request, db);

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // organizations.checkMembership
  // -------------------------------------------------------------------------

  describe("organizations.checkMembership", () => {
    it("should return exists: true when member", async () => {
      db.first.mockResolvedValue({ id: "m1" });

      const request: CheckOrgMembershipRequest = {
        method: "organizations.checkMembership",
        orgId: "o1",
        userId: "u1",
      };
      const response = await handleOrganizationsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: { exists: true } });
    });

    it("should return exists: false when not a member", async () => {
      db.first.mockResolvedValue(null);

      const request: CheckOrgMembershipRequest = {
        method: "organizations.checkMembership",
        orgId: "o1",
        userId: "u1",
      };
      const response = await handleOrganizationsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: { exists: false } });
    });

    it("should return 400 when params missing", async () => {
      const request = {
        method: "organizations.checkMembership",
        orgId: "",
        userId: "u1",
      } as CheckOrgMembershipRequest;
      const response = await handleOrganizationsRpc(request, db);

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // organizations.listMembers
  // -------------------------------------------------------------------------

  describe("organizations.listMembers", () => {
    it("should return organization members", async () => {
      const mockMembers = [
        { user_id: "u1", name: "User 1", image: null, slug: "user-1", joined_at: "2026-01-01T00:00:00Z" },
        { user_id: "u2", name: "User 2", image: null, slug: "user-2", joined_at: "2026-02-01T00:00:00Z" },
      ];
      db.all.mockResolvedValue({ results: mockMembers });

      const request: ListOrgMembersRequest = {
        method: "organizations.listMembers",
        orgId: "o1",
      };
      const response = await handleOrganizationsRpc(request, db);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ result: mockMembers });
    });

    it("should return 400 when orgId missing", async () => {
      const request = {
        method: "organizations.listMembers",
        orgId: "",
      } as ListOrgMembersRequest;
      const response = await handleOrganizationsRpc(request, db);

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown method
  // -------------------------------------------------------------------------

  describe("unknown method", () => {
    it("should return 400 for unknown method", async () => {
      const request = { method: "organizations.unknown" } as unknown as ListOrganizationsRequest;
      const response = await handleOrganizationsRpc(request, db);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain("Unknown organizations method");
    });
  });
});
