/**
 * GET /api/admin/showcases — list all showcases (admin only)
 *
 * Provides extended user info (email) for moderation purposes.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getDbRead } from "@/lib/db";
import { isAdmin } from "@/lib/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShowcaseRow {
  id: string;
  user_id: string;
  repo_key: string;
  github_url: string;
  title: string;
  description: string | null;
  tagline: string | null;
  og_image_url: string | null;
  is_public: number;
  created_at: string;
  refreshed_at: string;
  // Joined user fields (admin includes email)
  user_name: string | null;
  user_nickname: string | null;
  user_image: string | null;
  user_slug: string | null;
  user_email: string;
  // Computed
  upvote_count: number;
}

// ---------------------------------------------------------------------------
// GET — admin list all showcases
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const user = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const isPublicParam = url.searchParams.get("is_public");
  const userIdParam = url.searchParams.get("user_id");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  const dbRead = await getDbRead();

  try {
    // Build WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (isPublicParam !== null) {
      conditions.push("s.is_public = ?");
      params.push(isPublicParam === "1" ? 1 : 0);
    }

    if (userIdParam) {
      conditions.push("s.user_id = ?");
      params.push(userIdParam);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countResult = await dbRead.firstOrNull<{ count: number }>(
      `SELECT COUNT(*) as count FROM showcases s ${whereClause}`,
      params
    );
    const total = countResult?.count ?? 0;

    // Get showcases
    const query = `
      SELECT
        s.id, s.user_id, s.repo_key, s.github_url, s.title, s.description,
        s.tagline, s.og_image_url, s.is_public, s.created_at, s.refreshed_at,
        u.name as user_name, u.nickname as user_nickname, u.image as user_image,
        u.slug as user_slug, u.email as user_email,
        (SELECT COUNT(*) FROM showcase_upvotes WHERE showcase_id = s.id) as upvote_count
      FROM showcases s
      JOIN users u ON u.id = s.user_id
      ${whereClause}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ? OFFSET ?
    `;
    const { results } = await dbRead.query<ShowcaseRow>(query, [
      ...params,
      limit,
      offset,
    ]);

    return NextResponse.json({
      showcases: results.map((s) => ({
        id: s.id,
        repo_key: s.repo_key,
        github_url: s.github_url,
        title: s.title,
        description: s.description,
        tagline: s.tagline,
        og_image_url: s.og_image_url,
        upvote_count: s.upvote_count,
        is_public: s.is_public === 1,
        created_at: s.created_at,
        refreshed_at: s.refreshed_at,
        user: {
          id: s.user_id,
          email: s.user_email,
          name: s.user_name,
          nickname: s.user_nickname,
          image: s.user_image,
          slug: s.user_slug,
        },
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no such table")) {
      return NextResponse.json({ showcases: [], total: 0, limit, offset });
    }
    console.error("Failed to list showcases:", err);
    return NextResponse.json(
      { error: "Failed to list showcases" },
      { status: 500 }
    );
  }
}
