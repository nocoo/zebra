/**
 * GET /api/projects/timeline — daily session counts per project for a date range.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getDbRead } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET — timeline data
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authResult.userId;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  if (!from) {
    return NextResponse.json(
      { error: "from query param is required" },
      { status: 400 },
    );
  }

  // Default `to` to tomorrow (UTC) when absent — matches /api/usage pattern
  const to = toParam ?? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  const db = await getDbRead();

  try {
    const rows = await db.getProjectTimeline(userId, from, to);

    // Transform flat rows into { date, projects: { name: count } } entries
    const byDate = new Map<string, Record<string, number>>();
    for (const row of rows) {
      let entry = byDate.get(row.date);
      if (!entry) {
        entry = {};
        byDate.set(row.date, entry);
      }
      entry[row.project_name] = row.session_count;
    }

    const timeline = [...byDate.entries()].map(([date, projects]) => ({
      date,
      projects,
    }));

    return NextResponse.json({ timeline });
  } catch (err) {
    console.error("Failed to query project timeline:", err);
    return NextResponse.json(
      { error: "Failed to query project timeline" },
      { status: 500 },
    );
  }
}
