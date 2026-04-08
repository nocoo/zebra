/**
 * Organizations domain RPC handlers for worker-read.
 *
 * Handles all organization-related read queries with typed interfaces.
 */

import type { D1Database } from "@cloudflare/workers-types";

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface OrgMemberRow {
  user_id: string;
  name: string | null;
  image: string | null;
  slug: string | null;
  joined_at: string;
}

// ---------------------------------------------------------------------------
// RPC Request Types
// ---------------------------------------------------------------------------

export interface ListOrganizationsRequest {
  method: "organizations.list";
}

export interface ListUserOrganizationsRequest {
  method: "organizations.listForUser";
  userId: string;
}

export interface GetOrganizationByIdRequest {
  method: "organizations.getById";
  orgId: string;
}

export interface CheckOrgMembershipRequest {
  method: "organizations.checkMembership";
  orgId: string;
  userId: string;
}

export interface ListOrgMembersRequest {
  method: "organizations.listMembers";
  orgId: string;
}

export type OrganizationsRpcRequest =
  | ListOrganizationsRequest
  | ListUserOrganizationsRequest
  | GetOrganizationByIdRequest
  | CheckOrgMembershipRequest
  | ListOrgMembersRequest;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleListOrganizations(db: D1Database): Promise<Response> {
  const results = await db
    .prepare(
      `SELECT id, name, slug, created_at
       FROM organizations
       ORDER BY name ASC`
    )
    .all<OrgRow>();

  return Response.json({ result: results.results });
}

async function handleListUserOrganizations(
  req: ListUserOrganizationsRequest,
  db: D1Database
): Promise<Response> {
  if (!req.userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  const results = await db
    .prepare(
      `SELECT o.id, o.name, o.slug, o.created_at
       FROM organizations o
       JOIN organization_members om ON om.organization_id = o.id
       WHERE om.user_id = ?
       ORDER BY o.name ASC`
    )
    .bind(req.userId)
    .all<OrgRow>();

  return Response.json({ result: results.results });
}

async function handleGetOrganizationById(
  req: GetOrganizationByIdRequest,
  db: D1Database
): Promise<Response> {
  if (!req.orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  const result = await db
    .prepare(`SELECT id, name, slug, created_at FROM organizations WHERE id = ?`)
    .bind(req.orgId)
    .first<OrgRow>();

  return Response.json({ result: result });
}

async function handleCheckOrgMembership(
  req: CheckOrgMembershipRequest,
  db: D1Database
): Promise<Response> {
  if (!req.orgId || !req.userId) {
    return Response.json(
      { error: "orgId and userId are required" },
      { status: 400 }
    );
  }

  const result = await db
    .prepare(
      `SELECT id FROM organization_members
       WHERE organization_id = ? AND user_id = ?`
    )
    .bind(req.orgId, req.userId)
    .first<{ id: string }>();

  return Response.json({ result: { exists: result !== null } });
}

async function handleListOrgMembers(
  req: ListOrgMembersRequest,
  db: D1Database
): Promise<Response> {
  if (!req.orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  const results = await db
    .prepare(
      `SELECT u.id AS user_id, u.name, u.image, u.slug, om.joined_at
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = ?
       ORDER BY om.joined_at DESC`
    )
    .bind(req.orgId)
    .all<OrgMemberRow>();

  return Response.json({ result: results.results });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleOrganizationsRpc(
  request: OrganizationsRpcRequest,
  db: D1Database
): Promise<Response> {
  switch (request.method) {
    case "organizations.list":
      return handleListOrganizations(db);
    case "organizations.listForUser":
      return handleListUserOrganizations(request, db);
    case "organizations.getById":
      return handleGetOrganizationById(request, db);
    case "organizations.checkMembership":
      return handleCheckOrgMembership(request, db);
    case "organizations.listMembers":
      return handleListOrgMembers(request, db);
    default:
      return Response.json(
        { error: `Unknown organizations method: ${(request as { method: string }).method}` },
        { status: 400 }
      );
  }
}
