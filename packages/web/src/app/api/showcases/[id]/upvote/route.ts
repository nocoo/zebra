/**
 * POST /api/showcases/[id]/upvote — toggle upvote (auth required)
 *
 * Returns new upvote state and fresh count.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getDbRead, getDbWrite } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST — toggle upvote
// ---------------------------------------------------------------------------

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const user = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbRead = await getDbRead();
  const dbWrite = await getDbWrite();

  // Check showcase exists and is public
  let showcase: { id: string; is_public: number } | null;
  try {
    showcase = await dbRead.firstOrNull<{ id: string; is_public: number }>(
      "SELECT id, is_public FROM showcases WHERE id = ?",
      [id]
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no such table")) {
      return NextResponse.json({ error: "Showcase not found" }, { status: 404 });
    }
    console.error("Failed to find showcase:", err);
    return NextResponse.json(
      { error: "Failed to find showcase" },
      { status: 500 }
    );
  }

  if (!showcase) {
    return NextResponse.json({ error: "Showcase not found" }, { status: 404 });
  }

  // Only public showcases can be upvoted
  if (showcase.is_public !== 1) {
    return NextResponse.json(
      { error: "Cannot upvote hidden showcase" },
      { status: 403 }
    );
  }

  // Check current upvote state
  let existing: { id: number } | null;
  try {
    existing = await dbRead.firstOrNull<{ id: number }>(
      "SELECT id FROM showcase_upvotes WHERE showcase_id = ? AND user_id = ?",
      [id, user.userId]
    );
  } catch (err) {
    console.error("Failed to check upvote:", err);
    return NextResponse.json(
      { error: "Failed to check upvote status" },
      { status: 500 }
    );
  }

  // Toggle upvote
  try {
    if (existing) {
      // Remove upvote
      await dbWrite.execute(
        "DELETE FROM showcase_upvotes WHERE showcase_id = ? AND user_id = ?",
        [id, user.userId]
      );
    } else {
      // Add upvote
      await dbWrite.execute(
        "INSERT INTO showcase_upvotes (showcase_id, user_id) VALUES (?, ?)",
        [id, user.userId]
      );
    }
  } catch (err) {
    console.error("Failed to toggle upvote:", err);
    return NextResponse.json(
      { error: "Failed to toggle upvote" },
      { status: 500 }
    );
  }

  // Get fresh count
  let upvoteCount = 0;
  try {
    const countResult = await dbRead.firstOrNull<{ count: number }>(
      "SELECT COUNT(*) as count FROM showcase_upvotes WHERE showcase_id = ?",
      [id]
    );
    upvoteCount = countResult?.count ?? 0;
  } catch (err) {
    console.error("Failed to get upvote count:", err);
    // Non-fatal — return the toggle result with count 0
  }

  return NextResponse.json({
    upvoted: !existing,
    upvote_count: upvoteCount,
  });
}
