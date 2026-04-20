/**
 * GET /api/admin/check — check if the current user is an admin.
 *
 * Returns { isAdmin: true/false }.
 * Used by client-side components to conditionally show admin UI.
 *
 * In E2E mode with admin bypass (E2E_SKIP_AUTH=true + E2E_ADMIN_BYPASS=true
 * in development), always returns { isAdmin: true } so Playwright tests
 * can exercise admin pages.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/admin";
import { getDbRead } from "@/lib/db";

/** Check if admin bypass is enabled (for L3 Playwright tests) */
function isAdminBypass(): boolean {
  return (
    process.env.E2E_SKIP_AUTH === "true" &&
    process.env.E2E_ADMIN_BYPASS === "true" &&
    process.env.NODE_ENV === "development" &&
    !process.env.RAILWAY_ENVIRONMENT
  );
}

export async function GET(request: Request) {
  // In E2E mode with admin bypass, always return admin for testing
  if (isAdminBypass()) {
    return NextResponse.json({ isAdmin: true });
  }

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
