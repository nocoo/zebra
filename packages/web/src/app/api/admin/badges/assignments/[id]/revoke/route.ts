/**
 * POST /api/admin/badges/assignments/[id]/revoke — revoke or clear a badge assignment.
 *
 * Sets revoked_at, revoked_by, and revoke_reason for audit trail.
 * Works for both active (revoke) and expired (clear) assignments.
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
    return NextResponse.json(
      { error: "Assignment ID is required" },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : null;

  const dbRead = await getDbRead();
  const dbWrite = await getDbWrite();

  try {
    // Check assignment exists
    const assignment = await dbRead.getBadgeAssignment(id);
    if (!assignment) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    // Check not already revoked
    if (assignment.revoked_at) {
      return NextResponse.json(
        { error: "Assignment is already revoked" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    await dbWrite.execute(
      `UPDATE badge_assignments
       SET revoked_at = ?, revoked_by = ?, revoke_reason = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [now, admin.userId, reason, id],
    );

    return NextResponse.json({ success: true, revokedAt: now });
  } catch (err) {
    console.error("Failed to revoke badge assignment:", err);
    return NextResponse.json(
      { error: "Failed to revoke badge assignment" },
      { status: 500 },
    );
  }
}
