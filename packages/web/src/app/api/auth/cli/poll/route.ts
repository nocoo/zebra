/**
 * POST /api/auth/cli/poll — Poll for headless CLI login result.
 *
 * The CLI generates a random session_id and sends the user to:
 *   /api/auth/cli?headless={session_id}
 *
 * Then polls this endpoint until the user completes OAuth:
 *   POST /api/auth/cli/poll  { session: "..." }
 *
 * Returns { status: "pending" } or { status: "ok", api_key, email }.
 * Sessions expire after 5 minutes.
 */

import { NextResponse } from "next/server";
import { getDbRead, getDbWrite } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const session = body?.session;

  if (!session || typeof session !== "string") {
    return NextResponse.json(
      { error: "Missing session parameter" },
      { status: 400 },
    );
  }

  const dbRead = await getDbRead();

  try {
    const row = await dbRead.firstOrNull<{
      api_key: string;
      email: string;
      created_at: string;
    }>(
      "SELECT api_key, email, created_at FROM cli_auth_sessions WHERE session_id = ?",
      [session],
    );

    if (!row) {
      return NextResponse.json({ status: "pending" });
    }

    // Check expiry (5 minutes)
    const created = new Date(row.created_at).getTime();
    if (Date.now() - created > 5 * 60 * 1000) {
      // Clean up expired session
      const dbWrite = await getDbWrite();
      await dbWrite.execute(
        "DELETE FROM cli_auth_sessions WHERE session_id = ?",
        [session],
      );
      return NextResponse.json(
        { status: "expired", error: "Session expired" },
        { status: 410 },
      );
    }

    // Clean up used session
    const dbWrite = await getDbWrite();
    await dbWrite.execute(
      "DELETE FROM cli_auth_sessions WHERE session_id = ?",
      [session],
    );

    return NextResponse.json({
      status: "ok",
      api_key: row.api_key,
      email: row.email,
    });
  } catch (err) {
    console.error("CLI poll error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
