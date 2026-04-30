/**
 * Shared types for the dynamic pricing sync pipeline.
 *
 * All values stored in per-million-token units to match the existing
 * ModelPricing shape used by the web cost-calc layer.
 */

export interface DynamicPricingEntry {
  model: string;
  provider: string;
  displayName: string | null;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedPerMillion: number | null;
  contextWindow: number | null;
  origin: "baseline" | "openrouter" | "models.dev" | "admin";
  updatedAt: string;
  aliases?: string[];
}

export interface DynamicPricingMeta {
  lastSyncedAt: string;
  modelCount: number;
  baselineCount: number;
  openRouterCount: number;
  modelsDevCount: number;
  adminOverrideCount: number;
  lastErrors?: Array<{
    source: "openrouter" | "models.dev" | "d1" | "kv";
    at: string;
    message: string;
  }> | null;
}

/** Admin override row consumed by merge. Mirrors model_pricing schema. */
export interface AdminPricingRow {
  model: string;
  source: string | null;
  input: number;
  output: number;
  cached: number | null;
}

export const PRICING_ORIGINS = [
  "baseline",
  "openrouter",
  "models.dev",
  "admin",
] as const;
