/**
 * GET /api/organizations/mine — list organizations the current user belongs to.
 *
 * Requires authentication.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getDbRead } from "@/lib/db";

export async function GET(request: Request) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dbRead = await getDbRead();
    const results = await dbRead.listUserOrganizations(authResult.userId);

    const organizations = results.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      logoUrl: r.logo_url,
    }));

    return NextResponse.json({ organizations });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no such table")) {
      return NextResponse.json({ organizations: [] });
    }
    console.error("Failed to list user organizations:", err);
    return NextResponse.json(
      { error: "Failed to list organizations" },
      { status: 500 }
    );
  }
}
