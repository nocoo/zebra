/**
 * Showcases domain RPC handlers for worker-read.
 *
 * Handles all showcase-related read queries with typed interfaces.
 */

import type { D1Database } from "@cloudflare/workers-types";

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export interface ShowcaseRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  github_url: string;
  is_public: number;
  upvote_count: number;
  created_at: string;
  updated_at: string;
  owner_name: string | null;
  owner_slug: string | null;
  owner_image: string | null;
  languages: string | null;
  stars: number | null;
  forks: number | null;
  repo_description: string | null;
}

// ---------------------------------------------------------------------------
// RPC Request Types
// ---------------------------------------------------------------------------

export interface GetShowcaseByIdRequest {
  method: "showcases.getById";
  showcaseId: string;
}

export interface GetShowcaseBySlugRequest {
  method: "showcases.getBySlug";
  slug: string;
}

export interface GetShowcaseOwnerRequest {
  method: "showcases.getOwner";
  showcaseId: string;
}

export interface CheckShowcaseExistsRequest {
  method: "showcases.checkExists";
  userId: string;
  githubUrl: string;
}

export interface CheckUpvoteExistsRequest {
  method: "showcases.checkUpvote";
  showcaseId: string;
  visitorId: string;
}

export interface GetUpvoteCountRequest {
  method: "showcases.getUpvoteCount";
  showcaseId: string;
}

export interface ListShowcasesRequest {
  method: "showcases.list";
  userId?: string;
  publicOnly?: boolean;
  limit: number;
  offset: number;
}

export interface CountShowcasesRequest {
  method: "showcases.count";
  userId?: string;
  publicOnly?: boolean;
}

export type ShowcasesRpcRequest =
  | GetShowcaseByIdRequest
  | GetShowcaseBySlugRequest
  | GetShowcaseOwnerRequest
  | CheckShowcaseExistsRequest
  | CheckUpvoteExistsRequest
  | GetUpvoteCountRequest
  | ListShowcasesRequest
  | CountShowcasesRequest;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleGetShowcaseById(
  req: GetShowcaseByIdRequest,
  db: D1Database
): Promise<Response> {
  if (!req.showcaseId) {
    return Response.json({ error: "showcaseId is required" }, { status: 400 });
  }

  const result = await db
    .prepare(
      `SELECT s.*, u.name AS owner_name, u.slug AS owner_slug, u.image AS owner_image
       FROM showcases s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .bind(req.showcaseId)
    .first<ShowcaseRow>();

  return Response.json({ result: result });
}

async function handleGetShowcaseBySlug(
  req: GetShowcaseBySlugRequest,
  db: D1Database
): Promise<Response> {
  if (!req.slug) {
    return Response.json({ error: "slug is required" }, { status: 400 });
  }

  const result = await db
    .prepare(
      `SELECT s.*, u.name AS owner_name, u.slug AS owner_slug, u.image AS owner_image
       FROM showcases s
       JOIN users u ON u.id = s.user_id
       WHERE s.slug = ?`
    )
    .bind(req.slug)
    .first<ShowcaseRow>();

  return Response.json({ result: result });
}

async function handleGetShowcaseOwner(
  req: GetShowcaseOwnerRequest,
  db: D1Database
): Promise<Response> {
  if (!req.showcaseId) {
    return Response.json({ error: "showcaseId is required" }, { status: 400 });
  }

  const result = await db
    .prepare(`SELECT id, user_id FROM showcases WHERE id = ?`)
    .bind(req.showcaseId)
    .first<{ id: string; user_id: string }>();

  return Response.json({ result: result });
}

async function handleCheckShowcaseExists(
  req: CheckShowcaseExistsRequest,
  db: D1Database
): Promise<Response> {
  if (!req.userId || !req.githubUrl) {
    return Response.json(
      { error: "userId and githubUrl are required" },
      { status: 400 }
    );
  }

  const result = await db
    .prepare(`SELECT id FROM showcases WHERE user_id = ? AND github_url = ?`)
    .bind(req.userId, req.githubUrl)
    .first<{ id: string }>();

  return Response.json({ result: { exists: result !== null, id: result?.id } });
}

async function handleCheckUpvoteExists(
  req: CheckUpvoteExistsRequest,
  db: D1Database
): Promise<Response> {
  if (!req.showcaseId || !req.visitorId) {
    return Response.json(
      { error: "showcaseId and visitorId are required" },
      { status: 400 }
    );
  }

  const result = await db
    .prepare(
      `SELECT id FROM showcase_upvotes
       WHERE showcase_id = ? AND visitor_id = ?`
    )
    .bind(req.showcaseId, req.visitorId)
    .first<{ id: number }>();

  return Response.json({ result: { exists: result !== null } });
}

async function handleGetUpvoteCount(
  req: GetUpvoteCountRequest,
  db: D1Database
): Promise<Response> {
  if (!req.showcaseId) {
    return Response.json({ error: "showcaseId is required" }, { status: 400 });
  }

  const result = await db
    .prepare(`SELECT COUNT(*) AS count FROM showcase_upvotes WHERE showcase_id = ?`)
    .bind(req.showcaseId)
    .first<{ count: number }>();

  return Response.json({ result: result?.count ?? 0 });
}

async function handleListShowcases(
  req: ListShowcasesRequest,
  db: D1Database
): Promise<Response> {
  let sql = `SELECT s.*, u.name AS owner_name, u.slug AS owner_slug, u.image AS owner_image
             FROM showcases s
             JOIN users u ON u.id = s.user_id`;
  const params: unknown[] = [];

  if (req.userId) {
    sql += ` WHERE s.user_id = ?`;
    params.push(req.userId);
  } else if (req.publicOnly) {
    sql += ` WHERE s.is_public = 1`;
  }

  sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
  params.push(req.limit, req.offset);

  const results = await db.prepare(sql).bind(...params).all<ShowcaseRow>();

  return Response.json({ result: results.results });
}

async function handleCountShowcases(
  req: CountShowcasesRequest,
  db: D1Database
): Promise<Response> {
  let sql = `SELECT COUNT(*) AS count FROM showcases`;
  const params: unknown[] = [];

  if (req.userId) {
    sql += ` WHERE user_id = ?`;
    params.push(req.userId);
  } else if (req.publicOnly) {
    sql += ` WHERE is_public = 1`;
  }

  const stmt = db.prepare(sql);
  const result = params.length > 0
    ? await stmt.bind(...params).first<{ count: number }>()
    : await stmt.first<{ count: number }>();

  return Response.json({ result: result?.count ?? 0 });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleShowcasesRpc(
  request: ShowcasesRpcRequest,
  db: D1Database
): Promise<Response> {
  switch (request.method) {
    case "showcases.getById":
      return handleGetShowcaseById(request, db);
    case "showcases.getBySlug":
      return handleGetShowcaseBySlug(request, db);
    case "showcases.getOwner":
      return handleGetShowcaseOwner(request, db);
    case "showcases.checkExists":
      return handleCheckShowcaseExists(request, db);
    case "showcases.checkUpvote":
      return handleCheckUpvoteExists(request, db);
    case "showcases.getUpvoteCount":
      return handleGetUpvoteCount(request, db);
    case "showcases.list":
      return handleListShowcases(request, db);
    case "showcases.count":
      return handleCountShowcases(request, db);
    default:
      return Response.json(
        { error: `Unknown showcases method: ${(request as { method: string }).method}` },
        { status: 400 }
      );
  }
}
