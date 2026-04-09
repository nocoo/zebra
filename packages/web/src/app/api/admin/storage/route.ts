/**
 * GET /api/admin/storage — admin-only user storage overview.
 *
 * Returns per-user aggregated stats: total/input/output tokens,
 * session count, message count, total duration, etc.
 */

import { NextResponse } from "next/server";
import { resolveAdmin } from "@/lib/admin";
import { getDbRead } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types (re-export for backwards compatibility)
// ---------------------------------------------------------------------------

export type { AdminStorageUserRow as StorageUserRow } from "@/lib/rpc-types";

export interface StorageSummary {
  total_users: number;
  total_tokens: number;
  total_sessions: number;
  total_usage_rows: number;
}

// ---------------------------------------------------------------------------
// GET — per-user storage stats
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const admin = await resolveAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDbRead();

  try {
    // Per-user aggregated stats via RPC
    const users = await db.getAdminStorageStats();

    // Summary row
    const summary: StorageSummary = {
      total_users: users.length,
      total_tokens: users.reduce((s, r) => s + r.total_tokens, 0),
      total_sessions: users.reduce((s, r) => s + r.session_count, 0),
      total_usage_rows: users.reduce((s, r) => s + r.usage_row_count, 0),
    };

    return NextResponse.json({ users, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no such table")) {
      return NextResponse.json({
        users: [],
        summary: { total_users: 0, total_tokens: 0, total_sessions: 0, total_usage_rows: 0 },
      });
    }
    console.error("Failed to load storage stats:", err);
    return NextResponse.json(
      { error: "Failed to load storage stats" },
      { status: 500 }
    );
  }
}
