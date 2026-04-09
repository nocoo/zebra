/**
 * GET /api/pricing — public pricing map (merged static + DB).
 *
 * Returns the full PricingMap that clients use for cost estimation.
 * Authenticated users get the same data — no admin required.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getDbRead } from "@/lib/db";
import {
  getDefaultPricingMap,
  buildPricingMap,
} from "@/lib/pricing";

export async function GET(request: Request) {
  const authResult = await resolveUser(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDbRead();

  try {
    const results = await db.listModelPricing();
    const pricingMap = buildPricingMap(results);
    return NextResponse.json(pricingMap);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Table might not exist yet — fall back to static defaults
    if (msg.includes("no such table")) {
      return NextResponse.json(getDefaultPricingMap());
    }
    console.error("Failed to load pricing:", err);
    return NextResponse.json(getDefaultPricingMap());
  }
}
