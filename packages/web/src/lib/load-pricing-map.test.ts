/**
 * Partial-degradation matrix for the loadPricingMap helper.
 *
 * Two server entry points (/api/pricing and /api/usage/by-device) both go
 * through this helper so they share one policy. Each branch must keep
 * working independently — losing dynamic data must not also wipe the admin
 * overlay, and vice versa.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadPricingMap } from "./load-pricing-map";
import { DEFAULT_PREFIX_PRICES, DEFAULT_SOURCE_DEFAULTS } from "./pricing";
import type { DbRead } from "./db";

type PricingMapDb = Pick<DbRead, "getDynamicPricing" | "listModelPricing">;

function makeDb(overrides: {
  dynamic?: () => ReturnType<DbRead["getDynamicPricing"]>;
  pricing?: () => ReturnType<DbRead["listModelPricing"]>;
}): PricingMapDb {
  return {
    getDynamicPricing:
      overrides.dynamic ??
      vi.fn().mockResolvedValue({ entries: [], servedFrom: "baseline" }),
    listModelPricing: overrides.pricing ?? vi.fn().mockResolvedValue([]),
  };
}

describe("loadPricingMap", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("both succeed → buildPricingMap with both inputs", async () => {
    const db = makeDb({
      dynamic: vi.fn().mockResolvedValue({
        entries: [
          {
            model: "claude-sonnet-4-20250514",
            provider: "Anthropic",
            displayName: "Claude Sonnet 4",
            inputPerMillion: 3,
            outputPerMillion: 15,
            cachedPerMillion: 0.3,
            contextWindow: 200000,
            origin: "baseline" as const,
            updatedAt: "2026-04-30T00:00:00.000Z",
          },
        ],
        servedFrom: "kv" as const,
      }),
      pricing: vi.fn().mockResolvedValue([
        {
          id: 1,
          model: "gpt-4o",
          input: 7,
          output: 21,
          cached: 1.5,
          source: null,
          note: null,
          updated_at: "2026-04-30T00:00:00.000Z",
          created_at: "2026-04-30T00:00:00.000Z",
        },
      ]),
    });
    const map = await loadPricingMap(db);
    expect(map.models["claude-sonnet-4-20250514"]).toEqual({
      input: 3,
      output: 15,
      cached: 0.3,
    });
    expect(map.models["gpt-4o"]).toEqual({ input: 7, output: 21, cached: 1.5 });
  });

  it("dynamic rejects, dbRows resolves → admin overlay still applied", async () => {
    const db = makeDb({
      dynamic: vi.fn().mockRejectedValue(new Error("worker-read down")),
      pricing: vi.fn().mockResolvedValue([
        {
          id: 1,
          model: "gpt-4o",
          input: 7,
          output: 21,
          cached: 1.5,
          source: null,
          note: null,
          updated_at: "2026-04-30T00:00:00.000Z",
          created_at: "2026-04-30T00:00:00.000Z",
        },
      ]),
    });
    const map = await loadPricingMap(db);
    expect(map.models["gpt-4o"]).toEqual({ input: 7, output: 21, cached: 1.5 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "loadPricingMap: getDynamicPricing failed",
      expect.any(Error),
    );
  });

  it("dbRows rejects, dynamic resolves → dynamic still applied", async () => {
    const db = makeDb({
      dynamic: vi.fn().mockResolvedValue({
        entries: [
          {
            model: "claude-sonnet-4-20250514",
            provider: "Anthropic",
            displayName: "Claude Sonnet 4",
            inputPerMillion: 3,
            outputPerMillion: 15,
            cachedPerMillion: 0.3,
            contextWindow: 200000,
            origin: "baseline" as const,
            updatedAt: "2026-04-30T00:00:00.000Z",
          },
        ],
        servedFrom: "kv" as const,
      }),
      pricing: vi.fn().mockRejectedValue(new Error("D1 down")),
    });
    const map = await loadPricingMap(db);
    expect(map.models["claude-sonnet-4-20250514"]).toEqual({
      input: 3,
      output: 15,
      cached: 0.3,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "loadPricingMap: listModelPricing failed",
      expect.any(Error),
    );
  });

  it("both reject → safety-net only (prefixes + source defaults + fallback)", async () => {
    const db = makeDb({
      dynamic: vi.fn().mockRejectedValue(new Error("worker-read down")),
      pricing: vi.fn().mockRejectedValue(new Error("D1 down")),
    });
    const map = await loadPricingMap(db);
    expect(map.models).toEqual({});
    expect(map.prefixes).toEqual(DEFAULT_PREFIX_PRICES);
    expect(map.sourceDefaults).toEqual(DEFAULT_SOURCE_DEFAULTS);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });

  it("never throws — even when db.* throws synchronously", async () => {
    const db: PricingMapDb = {
      getDynamicPricing: vi.fn(() => {
        throw new Error("sync throw");
      }),
      listModelPricing: vi.fn(() => {
        throw new Error("sync throw");
      }),
    };
    await expect(loadPricingMap(db)).resolves.toBeDefined();
  });
});
