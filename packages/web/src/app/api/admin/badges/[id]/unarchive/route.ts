/**
 * POST /api/admin/badges/[id]/unarchive — unarchive a badge definition.
 *
 * Restores an archived badge so it can be assigned again.
 */

import { NextResponse } from "next/server";
import { resolveAdmin } from "@/lib/admin";
import { getDbRead, getDbWrite } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await resolveAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Badge ID is required" }, { status: 400 });
  }

  const dbRead = await getDbRead();
  const dbWrite = await getDbWrite();

  try {
    // Check badge exists
    const badge = await dbRead.getBadge(id);
    if (!badge) {
      return NextResponse.json({ error: "Badge not found" }, { status: 404 });
    }

    if (badge.is_archived === 0) {
      return NextResponse.json(
        { error: "Badge is not archived" },
        { status: 400 },
      );
    }

    await dbWrite.execute(
      `UPDATE badges SET is_archived = 0, updated_at = datetime('now') WHERE id = ?`,
      [id],
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to unarchive badge:", err);
    return NextResponse.json(
      { error: "Failed to unarchive badge" },
      { status: 500 },
    );
  }
}
