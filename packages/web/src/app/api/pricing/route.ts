/**
 * GET /api/pricing — public pricing map (merged dynamic + admin DB).
 *
 * Returns the full PricingMap that clients use for cost estimation.
 * Authenticated users get the same data — no admin required.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getDbRead } from "@/lib/db";
import { loadPricingMap } from "@/lib/load-pricing-map";

export async function GET(request: Request) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDbRead();
  const pricingMap = await loadPricingMap(db);
  return NextResponse.json(pricingMap);
}
