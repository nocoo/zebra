/**
 * Usage data aggregation helpers extracted from page components.
 *
 * These pure functions group UsageRow[] into higher-level aggregates
 * (by model, by app/source, by date) for the dashboard views.
 */

import type { UsageRow } from "@/hooks/use-usage-data";
import { sourceLabel } from "@/hooks/use-usage-data";
import { lookupPricing, estimateCost } from "@/lib/pricing";
import type { PricingMap } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelGroup {
  model: string;
  sources: string[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  estimatedCost: number;
  pctOfTotal: number;
}

export interface ModelRow {
  model: string;
  input: number;
  output: number;
  cached: number;
  total: number;
  cost: number;
}

export interface AppGroup {
  source: string;
  label: string;
  records: UsageRow[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  estimatedCost: number;
  models: ModelRow[];
}

export interface DailyGroup {
  date: string;
  records: UsageRow[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

/** Local-day bucket with aggregated token counts. */
export interface LocalDailyBucket {
  /** Local date string "YYYY-MM-DD" */
  date: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// groupByModel
// ---------------------------------------------------------------------------

/** Group usage records by model, compute per-model aggregates. */
export function groupByModel(records: UsageRow[], pricingMap: PricingMap): ModelGroup[] {
  const byModel = new Map<string, {
    sources: Set<string>;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    estimatedCost: number;
  }>();

  let grandTotal = 0;

  for (const r of records) {
    grandTotal += r.total_tokens;
    const existing = byModel.get(r.model);
    const pricing = lookupPricing(pricingMap, r.model, r.source);
    const cost = estimateCost(r.input_tokens, r.output_tokens, r.cached_input_tokens, pricing);

    if (existing) {
      existing.sources.add(r.source);
      existing.inputTokens += r.input_tokens;
      existing.outputTokens += r.output_tokens;
      existing.cachedTokens += r.cached_input_tokens;
      existing.totalTokens += r.total_tokens;
      existing.estimatedCost += cost.totalCost;
    } else {
      byModel.set(r.model, {
        sources: new Set([r.source]),
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        cachedTokens: r.cached_input_tokens,
        totalTokens: r.total_tokens,
        estimatedCost: cost.totalCost,
      });
    }
  }

  return Array.from(byModel.entries())
    .map(([model, data]) => ({
      model,
      sources: Array.from(data.sources),
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cachedTokens: data.cachedTokens,
      totalTokens: data.totalTokens,
      estimatedCost: data.estimatedCost,
      pctOfTotal: grandTotal > 0 ? (data.totalTokens / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

// ---------------------------------------------------------------------------
// groupByApp
// ---------------------------------------------------------------------------

/** Group usage records by source (app), with nested per-model breakdown. */
export function groupByApp(records: UsageRow[], pricingMap: PricingMap): AppGroup[] {
  const bySource = new Map<string, UsageRow[]>();

  for (const r of records) {
    const existing = bySource.get(r.source);
    if (existing) {
      existing.push(r);
    } else {
      bySource.set(r.source, [r]);
    }
  }

  return Array.from(bySource.entries())
    .map(([source, recs]) => {
      let inputTokens = 0;
      let outputTokens = 0;
      let cachedTokens = 0;
      let totalTokens = 0;
      let estimatedCost = 0;

      const byModel = new Map<string, ModelRow>();

      for (const r of recs) {
        inputTokens += r.input_tokens;
        outputTokens += r.output_tokens;
        cachedTokens += r.cached_input_tokens;
        totalTokens += r.total_tokens;

        const pricing = lookupPricing(pricingMap, r.model, r.source);
        const cost = estimateCost(r.input_tokens, r.output_tokens, r.cached_input_tokens, pricing);
        estimatedCost += cost.totalCost;

        const existing = byModel.get(r.model);
        if (existing) {
          existing.input += r.input_tokens;
          existing.output += r.output_tokens;
          existing.cached += r.cached_input_tokens;
          existing.total += r.total_tokens;
          existing.cost += cost.totalCost;
        } else {
          byModel.set(r.model, {
            model: r.model,
            input: r.input_tokens,
            output: r.output_tokens,
            cached: r.cached_input_tokens,
            total: r.total_tokens,
            cost: cost.totalCost,
          });
        }
      }

      const models = Array.from(byModel.values()).sort((a, b) => b.total - a.total);

      return {
        source,
        label: sourceLabel(source),
        records: recs,
        inputTokens,
        outputTokens,
        cachedTokens,
        totalTokens,
        estimatedCost,
        models,
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

// ---------------------------------------------------------------------------
// groupByDate
// ---------------------------------------------------------------------------

/** Group usage records by date (YYYY-MM-DD), sorted newest-first. */
export function groupByDate(records: UsageRow[], pricingMap: PricingMap): DailyGroup[] {
  const byDate = new Map<string, UsageRow[]>();

  for (const r of records) {
    const date = r.hour_start.slice(0, 10);
    const existing = byDate.get(date);
    if (existing) {
      existing.push(r);
    } else {
      byDate.set(date, [r]);
    }
  }

  return Array.from(byDate.entries())
    .map(([date, recs]) => {
      let inputTokens = 0;
      let outputTokens = 0;
      let cachedTokens = 0;
      let totalTokens = 0;
      let cost = 0;

      for (const r of recs) {
        inputTokens += r.input_tokens;
        outputTokens += r.output_tokens;
        cachedTokens += r.cached_input_tokens;
        totalTokens += r.total_tokens;
        const pricing = lookupPricing(pricingMap, r.model, r.source);
        const c = estimateCost(
          r.input_tokens,
          r.output_tokens,
          r.cached_input_tokens,
          pricing,
        );
        cost += c.totalCost;
      }

      return {
        date,
        records: recs,
        inputTokens,
        outputTokens,
        cachedTokens,
        totalTokens,
        estimatedCost: cost,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Extract helpers
// ---------------------------------------------------------------------------

/** Extract unique source values from records, sorted alphabetically. */
export function extractSources(records: UsageRow[]): string[] {
  const set = new Set<string>();
  for (const r of records) set.add(r.source);
  return Array.from(set).sort();
}

/** Extract unique model values from records, sorted alphabetically. */
export function extractModels(records: UsageRow[]): string[] {
  const set = new Set<string>();
  for (const r of records) set.add(r.model);
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// toLocalDailyBuckets
// ---------------------------------------------------------------------------

/**
 * Re-bucket half-hour UsageRow[] into local-day totals.
 *
 * Applies `tzOffset` (minutes, from `new Date().getTimezoneOffset()`) to shift
 * each row's `hour_start` from UTC to local time, then groups by local date.
 * Results are sorted ascending by date.
 *
 * @param rows     — raw UsageRow[] (should be half-hour granularity for accuracy)
 * @param tzOffset — minutes offset from UTC (positive = west, e.g. 480 for PST)
 */
export function toLocalDailyBuckets(
  rows: UsageRow[],
  tzOffset: number = 0,
): LocalDailyBucket[] {
  const byDate = new Map<string, LocalDailyBucket>();

  for (const r of rows) {
    // Shift UTC time by tzOffset to get local time
    const utcMs = new Date(r.hour_start).getTime();
    const localMs = utcMs - tzOffset * 60_000;
    const localDate = new Date(localMs);
    const date = localDate.toISOString().slice(0, 10);

    const existing = byDate.get(date);
    if (existing) {
      existing.inputTokens += r.input_tokens;
      existing.outputTokens += r.output_tokens;
      existing.cachedTokens += r.cached_input_tokens;
      existing.totalTokens += r.total_tokens;
    } else {
      byDate.set(date, {
        date,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        cachedTokens: r.cached_input_tokens,
        totalTokens: r.total_tokens,
      });
    }
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
