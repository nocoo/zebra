/**
 * GET /api/admin/check — check if the current user is an admin.
 *
 * Returns { isAdmin: true/false }.
 * Used by client-side components to conditionally show admin UI.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/admin";
import { getDbRead } from "@/lib/db";

export async function GET(request: Request) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ isAdmin: false });
  }

  let email: string | null | undefined = authResult.email;
  if (!email) {
    const db = await getDbRead();
    email = await db.getUserEmail(authResult.userId);
  }

  return NextResponse.json({ isAdmin: isAdmin(email) });
}
