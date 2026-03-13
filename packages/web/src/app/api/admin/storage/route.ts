/**
 * GET /api/admin/storage — admin-only user storage overview.
 *
 * Returns per-user aggregated stats: total/input/output tokens,
 * session count, message count, total duration, etc.
 */

import { NextResponse } from "next/server";
import { resolveAdmin } from "@/lib/admin";
import { getD1Client } from "@/lib/d1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StorageUserRow {
  user_id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  team_count: number;
  device_count: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  reasoning_output_tokens: number;
  usage_row_count: number;
  session_count: number;
  total_messages: number;
  total_duration_seconds: number;
  first_seen: string | null;
  last_seen: string | null;
}

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

  const client = getD1Client();

  try {
    // Per-user aggregated stats via two sub-queries joined to users
    const { results: users } = await client.query<StorageUserRow>(
      `SELECT
         u.id              AS user_id,
         u.email,
         u.name,
         u.image,
         COALESCE(tm_cnt.team_count, 0)            AS team_count,
         COALESCE(dev_cnt.device_count, 0)          AS device_count,
         COALESCE(tok.total_tokens, 0)              AS total_tokens,
         COALESCE(tok.input_tokens, 0)              AS input_tokens,
         COALESCE(tok.output_tokens, 0)             AS output_tokens,
         COALESCE(tok.cached_input_tokens, 0)       AS cached_input_tokens,
         COALESCE(tok.reasoning_output_tokens, 0)   AS reasoning_output_tokens,
         COALESCE(tok.usage_row_count, 0)           AS usage_row_count,
         COALESCE(sess.session_count, 0)            AS session_count,
         COALESCE(sess.total_messages, 0)           AS total_messages,
         COALESCE(sess.total_duration_seconds, 0)   AS total_duration_seconds,
         COALESCE(tok.first_seen, sess.first_seen)  AS first_seen,
         COALESCE(tok.last_seen, sess.last_seen)    AS last_seen
       FROM users u
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS team_count
         FROM team_members
         GROUP BY user_id
       ) tm_cnt ON tm_cnt.user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(DISTINCT device_id) AS device_count
         FROM usage_records
         GROUP BY user_id
       ) dev_cnt ON dev_cnt.user_id = u.id
       LEFT JOIN (
         SELECT
           user_id,
           SUM(total_tokens)              AS total_tokens,
           SUM(input_tokens)              AS input_tokens,
           SUM(output_tokens)             AS output_tokens,
           SUM(cached_input_tokens)       AS cached_input_tokens,
           SUM(reasoning_output_tokens)   AS reasoning_output_tokens,
           COUNT(*)                        AS usage_row_count,
           MIN(hour_start)                AS first_seen,
           MAX(hour_start)                AS last_seen
         FROM usage_records
         GROUP BY user_id
       ) tok ON tok.user_id = u.id
       LEFT JOIN (
         SELECT
           user_id,
           COUNT(*)                        AS session_count,
           SUM(total_messages)            AS total_messages,
           SUM(duration_seconds)          AS total_duration_seconds,
           MIN(started_at)               AS first_seen,
           MAX(last_message_at)          AS last_seen
         FROM session_records
         GROUP BY user_id
       ) sess ON sess.user_id = u.id
       WHERE tok.user_id IS NOT NULL OR sess.user_id IS NOT NULL
       ORDER BY total_tokens DESC`
    );

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
