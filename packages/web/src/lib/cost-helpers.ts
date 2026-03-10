/**
 * Cost computation helpers extracted from page components.
 *
 * `computeTotalCost` was duplicated in dashboard/page.tsx and
 * profile-view.tsx — now it lives here as the single source of truth.
 */

import type { ModelAggregate } from "@/hooks/use-usage-data";
import { lookupPricing, estimateCost } from "@/lib/pricing";
import type { PricingMap } from "@/lib/pricing";

/** Sum estimated cost across an array of model aggregates. */
export function computeTotalCost(
  models: ModelAggregate[],
  pricingMap: PricingMap,
): number {
  let total = 0;
  for (const m of models) {
    const pricing = lookupPricing(pricingMap, m.model, m.source);
    const cost = estimateCost(m.input, m.output, m.cached, pricing);
    total += cost.totalCost;
  }
  return total;
}
