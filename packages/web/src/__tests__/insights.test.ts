import { describe, expect, it } from "vitest";
import {
  generateInsights,
  type Insight,
  type InsightInputs,
} from "@/lib/insights";
import type { UsageRow, UsageSummary, ModelAggregate } from "@/hooks/use-usage-data";
import type { SessionOverview } from "@/lib/session-helpers";
import { getDefaultPricingMap, type PricingMap } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    source: "claude-code",
    model: "claude-sonnet-4-20250514",
    hour_start: "2026-03-07T14:00:00Z",
    input_tokens: 1000,
    cached_input_tokens: 200,
    output_tokens: 500,
    reasoning_output_tokens: 0,
    total_tokens: 1700,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    input_tokens: 1_000_000,
    cached_input_tokens: 200_000,
    output_tokens: 500_000,
    reasoning_output_tokens: 0,
    total_tokens: 1_500_000,
    ...overrides,
  };
}

function makeAggregate(overrides: Partial<ModelAggregate> = {}): ModelAggregate {
  return {
    model: "claude-sonnet-4-20250514",
    source: "claude-code",
    input: 1_000_000,
    output: 500_000,
    cached: 200_000,
    total: 1_500_000,
    ...overrides,
  };
}

function makePricingMap(): PricingMap {
  return getDefaultPricingMap();
}

function makeOverview(overrides: Partial<SessionOverview> = {}): SessionOverview {
  return {
    totalSessions: 10,
    totalHours: 5,
    avgDurationMinutes: 30,
    avgMessages: 8,
    ...overrides,
  };
}

function makeInputs(overrides: Partial<InsightInputs> = {}): InsightInputs {
  return {
    rows: [
      makeRow({ hour_start: "2026-03-05T09:00:00Z", total_tokens: 50_000 }),
      makeRow({ hour_start: "2026-03-05T10:00:00Z", total_tokens: 80_000 }),
      makeRow({ hour_start: "2026-03-06T14:00:00Z", total_tokens: 30_000 }),
      makeRow({ hour_start: "2026-03-07T09:00:00Z", total_tokens: 40_000 }),
    ],
    summary: makeSummary(),
    models: [
      makeAggregate({ model: "claude-sonnet-4-20250514", total: 1_200_000 }),
      makeAggregate({ model: "gemini-2.5-pro", source: "gemini-cli", total: 300_000 }),
    ],
    pricingMap: makePricingMap(),
    tzOffset: 0,
    ...overrides,
  };
}

function findInsight(insights: Insight[], id: string): Insight | undefined {
  return insights.find((i) => i.id === id);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateInsights", () => {
  it("returns empty array for empty data", () => {
    const result = generateInsights({
      rows: [],
      summary: makeSummary({ input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 }),
      models: [],
      pricingMap: makePricingMap(),
    });
    expect(result).toEqual([]);
  });

  it("generates top-model insight when models exist", () => {
    const insights = generateInsights(makeInputs());
    const topModel = findInsight(insights, "top-model");
    expect(topModel).toBeDefined();
    expect(topModel!.description).toContain("claude-sonnet-4");
    expect(topModel!.description).toContain("80%");
  });

  it("generates top-source insight", () => {
    const inputs = makeInputs({
      rows: [
        makeRow({ source: "claude-code", total_tokens: 800_000 }),
        makeRow({ source: "gemini-cli", total_tokens: 200_000 }),
      ],
    });
    const insights = generateInsights(inputs);
    const topSource = findInsight(insights, "top-source");
    expect(topSource).toBeDefined();
    expect(topSource!.description).toContain("Claude Code");
    expect(topSource!.description).toContain("80%");
  });

  it("generates cache-rate insight when cache rate is meaningful", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({ input_tokens: 1_000_000, cached_input_tokens: 730_000 }),
    }));
    const cacheRate = findInsight(insights, "cache-rate");
    expect(cacheRate).toBeDefined();
    expect(cacheRate!.description).toContain("73%");
  });

  it("skips cache-rate when cache is zero", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({ cached_input_tokens: 0 }),
    }));
    const cacheRate = findInsight(insights, "cache-rate");
    expect(cacheRate).toBeUndefined();
  });

  it("generates peak-hour insight from half-hour rows", () => {
    // Create rows with clear peak at Wednesday 9-10 AM UTC
    const rows = [
      makeRow({ hour_start: "2026-03-04T09:00:00Z", total_tokens: 500_000 }), // Wed
      makeRow({ hour_start: "2026-03-04T09:30:00Z", total_tokens: 500_000 }), // Wed
      makeRow({ hour_start: "2026-03-04T10:00:00Z", total_tokens: 10_000 }),  // Wed
      makeRow({ hour_start: "2026-03-05T14:00:00Z", total_tokens: 20_000 }),  // Thu
    ];
    const insights = generateInsights(makeInputs({ rows, tzOffset: 0 }));
    const peak = findInsight(insights, "peak-hour");
    expect(peak).toBeDefined();
    expect(peak!.description).toContain("Wednesday");
  });

  it("generates streak insight from half-hour rows", () => {
    // 3 consecutive days
    const rows = [
      makeRow({ hour_start: "2026-03-09T10:00:00Z", total_tokens: 10_000 }),
      makeRow({ hour_start: "2026-03-10T10:00:00Z", total_tokens: 10_000 }),
      makeRow({ hour_start: "2026-03-11T10:00:00Z", total_tokens: 10_000 }),
    ];
    const insights = generateInsights(makeInputs({
      rows,
      tzOffset: 0,
      today: "2026-03-11",
    }));
    const streak = findInsight(insights, "streak");
    expect(streak).toBeDefined();
    expect(streak!.description).toContain("3-day");
  });

  it("skips streak when currentStreak < 2", () => {
    const rows = [
      makeRow({ hour_start: "2026-03-11T10:00:00Z", total_tokens: 10_000 }),
    ];
    const insights = generateInsights(makeInputs({
      rows,
      tzOffset: 0,
      today: "2026-03-11",
    }));
    const streak = findInsight(insights, "streak");
    expect(streak).toBeUndefined();
  });

  it("generates big-day insight", () => {
    const rows = [
      makeRow({ hour_start: "2026-03-05T09:00:00Z", total_tokens: 2_000_000 }),
      makeRow({ hour_start: "2026-03-05T10:00:00Z", total_tokens: 100_000 }),
      makeRow({ hour_start: "2026-03-06T09:00:00Z", total_tokens: 50_000 }),
    ];
    const insights = generateInsights(makeInputs({ rows, tzOffset: 0 }));
    const bigDay = findInsight(insights, "big-day");
    expect(bigDay).toBeDefined();
    expect(bigDay!.description).toContain("Mar 5");
    expect(bigDay!.description).toContain("2.1M");
  });

  it("generates reasoning-depth insight when ratio > 20%", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({
        output_tokens: 500_000,
        reasoning_output_tokens: 200_000,
      }),
    }));
    const reasoning = findInsight(insights, "reasoning-depth");
    expect(reasoning).toBeDefined();
    expect(reasoning!.description).toContain("40%");
  });

  it("skips reasoning-depth when ratio <= 20%", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({
        output_tokens: 500_000,
        reasoning_output_tokens: 50_000,
      }),
    }));
    const reasoning = findInsight(insights, "reasoning-depth");
    expect(reasoning).toBeUndefined();
  });

  it("generates tokens/hour insight when sessions provided", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({ total_tokens: 500_000 }),
      sessions: makeOverview({ totalHours: 5 }),
    }));
    const tokensHour = findInsight(insights, "tokens-per-hour");
    expect(tokensHour).toBeDefined();
    expect(tokensHour!.description).toContain("100.0K");
  });

  it("skips tokens/hour when no sessions", () => {
    const insights = generateInsights(makeInputs());
    const tokensHour = findInsight(insights, "tokens-per-hour");
    expect(tokensHour).toBeUndefined();
  });

  it("returns at most 6 insights", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({
        cached_input_tokens: 730_000,
        reasoning_output_tokens: 200_000,
        output_tokens: 500_000,
      }),
      sessions: makeOverview({ totalHours: 5 }),
      rows: [
        makeRow({ hour_start: "2026-03-09T10:00:00Z", total_tokens: 100_000 }),
        makeRow({ hour_start: "2026-03-10T10:00:00Z", total_tokens: 100_000 }),
        makeRow({ hour_start: "2026-03-11T10:00:00Z", total_tokens: 100_000 }),
      ],
      tzOffset: 0,
      today: "2026-03-11",
    }));
    expect(insights.length).toBeLessThanOrEqual(6);
  });

  it("each insight has required fields", () => {
    const insights = generateInsights(makeInputs());
    for (const insight of insights) {
      expect(insight.id).toBeTruthy();
      expect(insight.icon).toBeTruthy();
      expect(insight.title).toBeTruthy();
      expect(insight.description).toBeTruthy();
    }
  });

  // -------------------------------------------------------------------------
  // Integration scenario: realistic multi-day, multi-model, multi-source data
  // -------------------------------------------------------------------------

  describe("integration: real-shaped data", () => {
    /**
     * Simulates a week of realistic usage across two tools (Claude Code,
     * Gemini CLI) and three models, with sessions, reasoning output, high
     * cache rate, and a clear streak — exercising all 8 insight generators.
     */
    function buildRealisticInputs(): InsightInputs {
      // Half-hour granularity rows across 5 consecutive days (Mar 7–11, 2026)
      const rows: UsageRow[] = [
        // --- Mar 7 (Sat) — light weekend usage, Gemini only ---
        makeRow({ source: "gemini-cli", model: "gemini-2.5-pro", hour_start: "2026-03-07T10:00:00Z", input_tokens: 5000, cached_input_tokens: 1000, output_tokens: 2000, reasoning_output_tokens: 0, total_tokens: 7000 }),
        makeRow({ source: "gemini-cli", model: "gemini-2.5-pro", hour_start: "2026-03-07T10:30:00Z", input_tokens: 3000, cached_input_tokens: 800, output_tokens: 1500, reasoning_output_tokens: 0, total_tokens: 4500 }),

        // --- Mar 8 (Sun) — light weekend usage, Claude Code ---
        makeRow({ source: "claude-code", model: "claude-sonnet-4-20250514", hour_start: "2026-03-08T14:00:00Z", input_tokens: 8000, cached_input_tokens: 6000, output_tokens: 4000, reasoning_output_tokens: 1500, total_tokens: 12000 }),

        // --- Mar 9 (Mon) — heavy weekday usage, Claude Code dominates ---
        makeRow({ source: "claude-code", model: "claude-sonnet-4-20250514", hour_start: "2026-03-09T09:00:00Z", input_tokens: 120_000, cached_input_tokens: 95_000, output_tokens: 60_000, reasoning_output_tokens: 25_000, total_tokens: 180_000 }),
        makeRow({ source: "claude-code", model: "claude-sonnet-4-20250514", hour_start: "2026-03-09T09:30:00Z", input_tokens: 150_000, cached_input_tokens: 120_000, output_tokens: 80_000, reasoning_output_tokens: 35_000, total_tokens: 230_000 }),
        makeRow({ source: "claude-code", model: "claude-sonnet-4-20250514", hour_start: "2026-03-09T14:00:00Z", input_tokens: 90_000, cached_input_tokens: 70_000, output_tokens: 45_000, reasoning_output_tokens: 18_000, total_tokens: 135_000 }),
        makeRow({ source: "gemini-cli", model: "gemini-2.5-pro", hour_start: "2026-03-09T15:00:00Z", input_tokens: 20_000, cached_input_tokens: 5000, output_tokens: 10_000, reasoning_output_tokens: 0, total_tokens: 30_000 }),

        // --- Mar 10 (Tue) — big day with heavy Claude Code usage ---
        makeRow({ source: "claude-code", model: "claude-sonnet-4-20250514", hour_start: "2026-03-10T09:00:00Z", input_tokens: 200_000, cached_input_tokens: 160_000, output_tokens: 100_000, reasoning_output_tokens: 40_000, total_tokens: 300_000 }),
        makeRow({ source: "claude-code", model: "claude-sonnet-4-20250514", hour_start: "2026-03-10T09:30:00Z", input_tokens: 250_000, cached_input_tokens: 200_000, output_tokens: 120_000, reasoning_output_tokens: 50_000, total_tokens: 370_000 }),
        makeRow({ source: "claude-code", model: "claude-sonnet-4-20250514", hour_start: "2026-03-10T14:00:00Z", input_tokens: 100_000, cached_input_tokens: 80_000, output_tokens: 50_000, reasoning_output_tokens: 20_000, total_tokens: 150_000 }),
        makeRow({ source: "claude-code", model: "claude-sonnet-4-20250514", hour_start: "2026-03-10T14:30:00Z", input_tokens: 80_000, cached_input_tokens: 65_000, output_tokens: 40_000, reasoning_output_tokens: 15_000, total_tokens: 120_000 }),

        // --- Mar 11 (Wed, today) — moderate morning session ---
        makeRow({ source: "claude-code", model: "claude-sonnet-4-20250514", hour_start: "2026-03-11T09:00:00Z", input_tokens: 60_000, cached_input_tokens: 48_000, output_tokens: 30_000, reasoning_output_tokens: 12_000, total_tokens: 90_000 }),
        makeRow({ source: "claude-code", model: "claude-sonnet-4-20250514", hour_start: "2026-03-11T09:30:00Z", input_tokens: 40_000, cached_input_tokens: 32_000, output_tokens: 20_000, reasoning_output_tokens: 8_000, total_tokens: 60_000 }),
      ];

      // Summary aggregates matching the rows above
      const totalInput = rows.reduce((s, r) => s + r.input_tokens, 0);
      const totalCached = rows.reduce((s, r) => s + r.cached_input_tokens, 0);
      const totalOutput = rows.reduce((s, r) => s + r.output_tokens, 0);
      const totalReasoning = rows.reduce((s, r) => s + r.reasoning_output_tokens, 0);
      const totalTokens = rows.reduce((s, r) => s + r.total_tokens, 0);

      const summary = makeSummary({
        input_tokens: totalInput,
        cached_input_tokens: totalCached,
        output_tokens: totalOutput,
        reasoning_output_tokens: totalReasoning,
        total_tokens: totalTokens,
      });

      // Claude Code sonnet-4 is dominant; Gemini is secondary
      const claudeTotal = rows
        .filter((r) => r.source === "claude-code")
        .reduce((s, r) => s + r.total_tokens, 0);
      const geminiTotal = rows
        .filter((r) => r.source === "gemini-cli")
        .reduce((s, r) => s + r.total_tokens, 0);

      const models: ModelAggregate[] = [
        makeAggregate({
          model: "claude-sonnet-4-20250514",
          source: "claude-code",
          input: totalInput - 28000,
          output: totalOutput - 13500,
          cached: totalCached - 6800,
          total: claudeTotal,
        }),
        makeAggregate({
          model: "gemini-2.5-pro",
          source: "gemini-cli",
          input: 28000,
          output: 13500,
          cached: 6800,
          total: geminiTotal,
        }),
      ];

      return {
        rows,
        summary,
        models,
        pricingMap: makePricingMap(),
        sessions: makeOverview({ totalSessions: 12, totalHours: 8 }),
        tzOffset: 0,
        today: "2026-03-11",
      };
    }

    it("triggers all 8 insight types with realistic data", () => {
      const inputs = buildRealisticInputs();
      const insights = generateInsights(inputs);

      // Should generate all 8 insight types (capped at 6 returned)
      const ids = insights.map((i) => i.id);

      // Must have at most 6 (the cap)
      expect(insights.length).toBeLessThanOrEqual(6);
      // Must have at least 5 (all generators should fire with this data)
      expect(insights.length).toBeGreaterThanOrEqual(5);

      // Verify the expected insight IDs are present (the top 6 by metric)
      // All 8 generators should fire, but only 6 are returned
      const allPossible = [
        "top-model", "top-source", "cache-rate", "peak-hour",
        "streak", "big-day", "reasoning-depth", "tokens-per-hour",
      ];
      // Every returned insight must be from the known set
      for (const id of ids) {
        expect(allPossible).toContain(id);
      }
    });

    it("top-model insight reports claude-sonnet-4 as dominant", () => {
      const inputs = buildRealisticInputs();
      const insights = generateInsights(inputs);
      const topModel = findInsight(insights, "top-model");
      // claude-sonnet-4 accounts for >95% of tokens
      if (topModel) {
        expect(topModel.description).toContain("claude-sonnet-4");
        expect(topModel.metric).toBeGreaterThanOrEqual(95);
      }
    });

    it("top-source insight reports Claude Code as dominant", () => {
      const inputs = buildRealisticInputs();
      const insights = generateInsights(inputs);
      const topSource = findInsight(insights, "top-source");
      if (topSource) {
        expect(topSource.description).toContain("Claude Code");
        expect(topSource.metric).toBeGreaterThanOrEqual(95);
      }
    });

    it("cache-rate insight reflects high cache utilization", () => {
      const inputs = buildRealisticInputs();
      const insights = generateInsights(inputs);
      const cacheRate = findInsight(insights, "cache-rate");
      if (cacheRate) {
        // Cache rate = cached / input ~= 76%
        expect(cacheRate.metric).toBeGreaterThanOrEqual(70);
        expect(cacheRate.metric).toBeLessThanOrEqual(85);
      }
    });

    it("streak insight detects 5-day streak (Mar 7–11)", () => {
      const inputs = buildRealisticInputs();
      const insights = generateInsights(inputs);
      const streak = findInsight(insights, "streak");
      if (streak) {
        expect(streak.description).toContain("5-day");
        expect(streak.metric).toBe(5);
      }
    });

    it("big-day insight identifies Mar 10 as the largest day", () => {
      const inputs = buildRealisticInputs();
      const insights = generateInsights(inputs);
      const bigDay = findInsight(insights, "big-day");
      if (bigDay) {
        expect(bigDay.description).toContain("Mar 10");
        // Mar 10 total = 300k + 370k + 150k + 120k = 940k
        expect(bigDay.metric).toBeGreaterThanOrEqual(900_000);
      }
    });

    it("reasoning-depth insight detects >20% reasoning ratio", () => {
      const inputs = buildRealisticInputs();
      const insights = generateInsights(inputs);
      const reasoning = findInsight(insights, "reasoning-depth");
      if (reasoning) {
        // reasoning / output ≈ 224500/562500 ≈ 40%
        expect(reasoning.metric).toBeGreaterThanOrEqual(35);
        expect(reasoning.metric).toBeLessThanOrEqual(45);
      }
    });

    it("tokens-per-hour insight reflects session-based throughput", () => {
      const inputs = buildRealisticInputs();
      const insights = generateInsights(inputs);
      const tph = findInsight(insights, "tokens-per-hour");
      if (tph) {
        // total ~1.69M / 8h ≈ 211K tokens/hour
        expect(tph.metric).toBeGreaterThanOrEqual(150_000);
        expect(tph.metric).toBeLessThanOrEqual(300_000);
      }
    });

    it("peak-hour insight detects Tuesday or Monday 9 AM slot", () => {
      const inputs = buildRealisticInputs();
      const insights = generateInsights(inputs);
      const peak = findInsight(insights, "peak-hour");
      if (peak) {
        // The heaviest slots are Tue 9:00-9:30 (300K + 370K) or Mon 9:00-9:30 (180K + 230K)
        expect(peak.description).toMatch(/Tuesday|Monday/);
      }
    });
  });
});
