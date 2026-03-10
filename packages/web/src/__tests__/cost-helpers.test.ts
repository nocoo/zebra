import { describe, it, expect } from "vitest";
import { computeTotalCost } from "@/lib/cost-helpers";
import type { ModelAggregate } from "@/hooks/use-usage-data";
import { getDefaultPricingMap } from "@/lib/pricing";
import type { PricingMap } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePricingMap(overrides?: Partial<PricingMap>): PricingMap {
  return { ...getDefaultPricingMap(), ...overrides };
}

function makeAggregate(partial: Partial<ModelAggregate> = {}): ModelAggregate {
  return {
    model: "claude-sonnet-4-20250514",
    source: "claude-code",
    input: 1_000_000,
    output: 500_000,
    cached: 200_000,
    total: 1_500_000,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeTotalCost", () => {
  it("returns 0 for empty model list", () => {
    expect(computeTotalCost([], makePricingMap())).toBe(0);
  });

  it("computes cost for a single model using exact pricing match", () => {
    // claude-sonnet-4-20250514: input=$3/M, output=$15/M, cached=$0.3/M
    // Non-cached input = 1M - 200k = 800k
    // inputCost  = 800_000 / 1M * 3   = 2.4
    // outputCost = 500_000 / 1M * 15   = 7.5
    // cachedCost = 200_000 / 1M * 0.3  = 0.06
    // total = 9.96
    const models = [makeAggregate()];
    const cost = computeTotalCost(models, makePricingMap());
    expect(cost).toBeCloseTo(9.96, 2);
  });

  it("sums costs across multiple models", () => {
    const models = [
      makeAggregate({ model: "claude-sonnet-4-20250514", input: 1_000_000, output: 0, cached: 0 }),
      makeAggregate({ model: "claude-sonnet-4-20250514", input: 0, output: 1_000_000, cached: 0 }),
    ];
    // First:  input 1M * $3/M = $3
    // Second: output 1M * $15/M = $15
    const cost = computeTotalCost(models, makePricingMap());
    expect(cost).toBeCloseTo(18, 2);
  });

  it("uses fallback pricing for unknown models", () => {
    // Fallback: input=$3, output=$15, cached=$0.3
    const models = [
      makeAggregate({ model: "totally-unknown-model", source: "unknown-source", input: 1_000_000, output: 0, cached: 0 }),
    ];
    const cost = computeTotalCost(models, makePricingMap());
    expect(cost).toBeCloseTo(3, 2); // 1M input * $3/M
  });

  it("handles zero tokens gracefully", () => {
    const models = [makeAggregate({ input: 0, output: 0, cached: 0 })];
    expect(computeTotalCost(models, makePricingMap())).toBe(0);
  });
});
