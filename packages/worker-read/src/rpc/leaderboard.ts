/**
 * Leaderboard domain RPC handlers for worker-read.
 *
 * Handles leaderboard-related read queries.
 */

import type { D1Database } from "@cloudflare/workers-types";

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export interface LeaderboardEntryRow {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_tokens: number;
  rank: number;
}

export interface TeamLeaderboardEntryRow {
  team_id: string;
  team_name: string;
  team_avatar_url: string | null;
  total_tokens: number;
  rank: number;
}

// ---------------------------------------------------------------------------
// RPC Request Types
// ---------------------------------------------------------------------------

export interface GetUserLeaderboardRequest {
  method: "leaderboard.getUsers";
  seasonId: string;
  limit?: number;
  offset?: number;
}

export interface GetTeamLeaderboardRequest {
  method: "leaderboard.getTeams";
  seasonId: string;
  limit?: number;
  offset?: number;
}

export interface GetUserRankRequest {
  method: "leaderboard.getUserRank";
  seasonId: string;
  userId: string;
}

export interface GetTeamRankRequest {
  method: "leaderboard.getTeamRank";
  seasonId: string;
  teamId: string;
}

export type LeaderboardRpcRequest =
  | GetUserLeaderboardRequest
  | GetTeamLeaderboardRequest
  | GetUserRankRequest
  | GetTeamRankRequest;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleGetUserLeaderboard(
  req: GetUserLeaderboardRequest,
  db: D1Database
): Promise<Response> {
  if (!req.seasonId) {
    return Response.json({ error: "seasonId is required" }, { status: 400 });
  }

  const limit = req.limit ?? 50;
  const offset = req.offset ?? 0;

  const sql = `
    SELECT
      ss.user_id,
      u.username,
      u.avatar_url,
      ss.total_tokens,
      RANK() OVER (ORDER BY ss.total_tokens DESC) AS rank
    FROM season_snapshots ss
    JOIN users u ON u.id = ss.user_id
    WHERE ss.season_id = ? AND ss.team_id IS NULL
    ORDER BY ss.total_tokens DESC
    LIMIT ? OFFSET ?
  `;

  const results = await db
    .prepare(sql)
    .bind(req.seasonId, limit, offset)
    .all<LeaderboardEntryRow>();

  return Response.json({ result: results.results });
}

async function handleGetTeamLeaderboard(
  req: GetTeamLeaderboardRequest,
  db: D1Database
): Promise<Response> {
  if (!req.seasonId) {
    return Response.json({ error: "seasonId is required" }, { status: 400 });
  }

  const limit = req.limit ?? 50;
  const offset = req.offset ?? 0;

  const sql = `
    SELECT
      t.id AS team_id,
      t.name AS team_name,
      t.avatar_url AS team_avatar_url,
      SUM(ss.total_tokens) AS total_tokens,
      RANK() OVER (ORDER BY SUM(ss.total_tokens) DESC) AS rank
    FROM season_snapshots ss
    JOIN teams t ON t.id = ss.team_id
    WHERE ss.season_id = ? AND ss.team_id IS NOT NULL
    GROUP BY t.id, t.name, t.avatar_url
    ORDER BY total_tokens DESC
    LIMIT ? OFFSET ?
  `;

  const results = await db
    .prepare(sql)
    .bind(req.seasonId, limit, offset)
    .all<TeamLeaderboardEntryRow>();

  return Response.json({ result: results.results });
}

async function handleGetUserRank(
  req: GetUserRankRequest,
  db: D1Database
): Promise<Response> {
  if (!req.seasonId || !req.userId) {
    return Response.json(
      { error: "seasonId and userId are required" },
      { status: 400 }
    );
  }

  const sql = `
    WITH ranked AS (
      SELECT
        user_id,
        total_tokens,
        RANK() OVER (ORDER BY total_tokens DESC) AS rank
      FROM season_snapshots
      WHERE season_id = ? AND team_id IS NULL
    )
    SELECT rank, total_tokens FROM ranked WHERE user_id = ?
  `;

  const result = await db
    .prepare(sql)
    .bind(req.seasonId, req.userId)
    .first<{ rank: number; total_tokens: number }>();

  return Response.json({ result: result });
}

async function handleGetTeamRank(
  req: GetTeamRankRequest,
  db: D1Database
): Promise<Response> {
  if (!req.seasonId || !req.teamId) {
    return Response.json(
      { error: "seasonId and teamId are required" },
      { status: 400 }
    );
  }

  const sql = `
    WITH team_totals AS (
      SELECT
        team_id,
        SUM(total_tokens) AS total_tokens
      FROM season_snapshots
      WHERE season_id = ? AND team_id IS NOT NULL
      GROUP BY team_id
    ),
    ranked AS (
      SELECT
        team_id,
        total_tokens,
        RANK() OVER (ORDER BY total_tokens DESC) AS rank
      FROM team_totals
    )
    SELECT rank, total_tokens FROM ranked WHERE team_id = ?
  `;

  const result = await db
    .prepare(sql)
    .bind(req.seasonId, req.teamId)
    .first<{ rank: number; total_tokens: number }>();

  return Response.json({ result: result });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleLeaderboardRpc(
  request: LeaderboardRpcRequest,
  db: D1Database
): Promise<Response> {
  switch (request.method) {
    case "leaderboard.getUsers":
      return handleGetUserLeaderboard(request, db);
    case "leaderboard.getTeams":
      return handleGetTeamLeaderboard(request, db);
    case "leaderboard.getUserRank":
      return handleGetUserRank(request, db);
    case "leaderboard.getTeamRank":
      return handleGetTeamRank(request, db);
    default:
      return Response.json(
        { error: `Unknown leaderboard method: ${(request as { method: string }).method}` },
        { status: 400 }
      );
  }
}
