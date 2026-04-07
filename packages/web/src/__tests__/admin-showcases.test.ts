import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/admin/showcases/route";

// Mock dependencies
vi.mock("@/lib/auth-helpers", () => ({
  resolveUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDbRead: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  isAdmin: vi.fn(),
}));

import { resolveUser } from "@/lib/auth-helpers";
import { getDbRead } from "@/lib/db";
import { isAdmin } from "@/lib/admin";

const mockResolveUser = vi.mocked(resolveUser);
const mockGetDbRead = vi.mocked(getDbRead);
const mockIsAdmin = vi.mocked(isAdmin);

function createRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/admin/showcases");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

const mockShowcase = {
  id: "s1",
  user_id: "u1",
  repo_key: "owner/repo",
  github_url: "https://github.com/owner/repo",
  title: "My Repo",
  description: "A cool project",
  tagline: "Check this out!",
  og_image_url: "https://og.test/1/owner/repo",
  is_public: 1,
  created_at: "2026-01-01T00:00:00Z",
  refreshed_at: "2026-01-01T00:00:00Z",
  user_name: "Test User",
  user_nickname: null,
  user_image: null,
  user_slug: "testuser",
  user_email: "user@example.com",
  upvote_count: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/admin/showcases
// ---------------------------------------------------------------------------

describe("GET /api/admin/showcases", () => {
  describe("authentication and authorization", () => {
    it("returns 401 when not authenticated", async () => {
      mockResolveUser.mockResolvedValue(null);

      const res = await GET(createRequest());

      expect(res.status).toBe(401);
    });

    it("returns 403 when not admin", async () => {
      mockResolveUser.mockResolvedValue({ userId: "u1", email: "user@example.com" });
      mockIsAdmin.mockReturnValue(false);

      const res = await GET(createRequest());

      expect(res.status).toBe(403);
    });
  });

  describe("successful listing", () => {
    beforeEach(() => {
      mockResolveUser.mockResolvedValue({ userId: "admin", email: "admin@example.com" });
      mockIsAdmin.mockReturnValue(true);
    });

    it("returns all showcases with user email", async () => {
      const mockDb = {
        firstOrNull: vi.fn().mockResolvedValue({ count: 1 }),
        query: vi.fn().mockResolvedValue({ results: [mockShowcase] }),
      };
      mockGetDbRead.mockResolvedValue(mockDb as never);

      const res = await GET(createRequest());

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showcases).toHaveLength(1);
      expect(json.showcases[0].user.email).toBe("user@example.com");
      expect(json.total).toBe(1);
    });

    it("filters by is_public=1", async () => {
      const mockDb = {
        firstOrNull: vi.fn().mockResolvedValue({ count: 1 }),
        query: vi.fn().mockResolvedValue({ results: [mockShowcase] }),
      };
      mockGetDbRead.mockResolvedValue(mockDb as never);

      await GET(createRequest({ is_public: "1" }));

      expect(mockDb.firstOrNull).toHaveBeenCalledWith(
        expect.stringContaining("WHERE s.is_public = ?"),
        [1]
      );
    });

    it("filters by is_public=0", async () => {
      const mockDb = {
        firstOrNull: vi.fn().mockResolvedValue({ count: 0 }),
        query: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockGetDbRead.mockResolvedValue(mockDb as never);

      await GET(createRequest({ is_public: "0" }));

      expect(mockDb.firstOrNull).toHaveBeenCalledWith(
        expect.stringContaining("WHERE s.is_public = ?"),
        [0]
      );
    });

    it("filters by user_id", async () => {
      const mockDb = {
        firstOrNull: vi.fn().mockResolvedValue({ count: 1 }),
        query: vi.fn().mockResolvedValue({ results: [mockShowcase] }),
      };
      mockGetDbRead.mockResolvedValue(mockDb as never);

      await GET(createRequest({ user_id: "u1" }));

      expect(mockDb.firstOrNull).toHaveBeenCalledWith(
        expect.stringContaining("WHERE s.user_id = ?"),
        ["u1"]
      );
    });

    it("combines filters", async () => {
      const mockDb = {
        firstOrNull: vi.fn().mockResolvedValue({ count: 1 }),
        query: vi.fn().mockResolvedValue({ results: [mockShowcase] }),
      };
      mockGetDbRead.mockResolvedValue(mockDb as never);

      await GET(createRequest({ is_public: "1", user_id: "u1" }));

      expect(mockDb.firstOrNull).toHaveBeenCalledWith(
        expect.stringContaining("WHERE s.is_public = ? AND s.user_id = ?"),
        [1, "u1"]
      );
    });

    it("respects limit and offset params", async () => {
      const mockDb = {
        firstOrNull: vi.fn().mockResolvedValue({ count: 100 }),
        query: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockGetDbRead.mockResolvedValue(mockDb as never);

      const res = await GET(createRequest({ limit: "10", offset: "20" }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.limit).toBe(10);
      expect(json.offset).toBe(20);
    });

    it("caps limit at 200", async () => {
      const mockDb = {
        firstOrNull: vi.fn().mockResolvedValue({ count: 0 }),
        query: vi.fn().mockResolvedValue({ results: [] }),
      };
      mockGetDbRead.mockResolvedValue(mockDb as never);

      const res = await GET(createRequest({ limit: "500" }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.limit).toBe(200);
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      mockResolveUser.mockResolvedValue({ userId: "admin", email: "admin@example.com" });
      mockIsAdmin.mockReturnValue(true);
    });

    it("handles missing table gracefully", async () => {
      const mockDb = {
        firstOrNull: vi.fn().mockRejectedValue(new Error("no such table: showcases")),
      };
      mockGetDbRead.mockResolvedValue(mockDb as never);

      const res = await GET(createRequest());

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showcases).toEqual([]);
      expect(json.total).toBe(0);
    });

    it("returns 500 on unexpected DB error", async () => {
      const mockDb = {
        firstOrNull: vi.fn().mockRejectedValue(new Error("Connection refused")),
      };
      mockGetDbRead.mockResolvedValue(mockDb as never);

      const res = await GET(createRequest());

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Failed to list showcases");
    });
  });
});
