import { describe, it, expect } from "vitest";
import {
  toDailyPoints,
  toSourceAggregates,
  toHeatmapData,
  toModelAggregates,
  sourceLabel,
  type UsageRow,
} from "@/hooks/use-usage-data";
import { toLocalDailyBuckets } from "@/lib/usage-helpers";

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    source: "claude-code",
    model: "claude-sonnet-4-20250514",
    hour_start: "2026-03-07",
    input_tokens: 1000,
    cached_input_tokens: 200,
    output_tokens: 500,
    reasoning_output_tokens: 0,
    total_tokens: 1700,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// toDailyPoints
// ---------------------------------------------------------------------------

describe("toDailyPoints", () => {
  it("should return empty array for empty input", () => {
    expect(toDailyPoints([])).toEqual([]);
  });

  it("should aggregate records by date", () => {
    const records: UsageRow[] = [
      makeRow({ hour_start: "2026-03-07T00:00:00Z", input_tokens: 100, output_tokens: 50, cached_input_tokens: 10, reasoning_output_tokens: 0, total_tokens: 160 }),
      makeRow({ hour_start: "2026-03-07T12:00:00Z", input_tokens: 200, output_tokens: 100, cached_input_tokens: 20, reasoning_output_tokens: 0, total_tokens: 320 }),
      makeRow({ hour_start: "2026-03-08T00:00:00Z", input_tokens: 300, output_tokens: 150, cached_input_tokens: 30, reasoning_output_tokens: 0, total_tokens: 480 }),
    ];

    const daily = toDailyPoints(records);

    expect(daily).toHaveLength(2);
    expect(daily[0]!.date).toBe("2026-03-07");
    expect(daily[0]!.input).toBe(300);
    expect(daily[0]!.output).toBe(150);
    expect(daily[0]!.cached).toBe(30);
    expect(daily[1]!.date).toBe("2026-03-08");
    expect(daily[1]!.input).toBe(300);
  });

  it("should sort by date ascending", () => {
    const records = [
      makeRow({ hour_start: "2026-03-09" }),
      makeRow({ hour_start: "2026-03-07" }),
      makeRow({ hour_start: "2026-03-08" }),
    ];

    const daily = toDailyPoints(records);

    expect(daily.map((d) => d.date)).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
    ]);
  });
});

// ---------------------------------------------------------------------------
// toSourceAggregates
// ---------------------------------------------------------------------------

describe("toSourceAggregates", () => {
  it("should return empty array for empty input", () => {
    expect(toSourceAggregates([])).toEqual([]);
  });

  it("should aggregate by source and sort by total descending", () => {
    const records = [
      makeRow({ source: "claude-code", total_tokens: 1000 }),
      makeRow({ source: "gemini-cli", total_tokens: 3000 }),
      makeRow({ source: "claude-code", total_tokens: 2000 }),
      makeRow({ source: "opencode", total_tokens: 500 }),
    ];

    const result = toSourceAggregates(records);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ label: "claude-code", value: 3000 });
    expect(result[1]).toEqual({ label: "gemini-cli", value: 3000 });
    expect(result[2]).toEqual({ label: "opencode", value: 500 });
  });
});

// ---------------------------------------------------------------------------
// toHeatmapData
// ---------------------------------------------------------------------------

describe("toHeatmapData", () => {
  it("should convert daily points to heatmap format", () => {
    const daily = [
      { date: "2026-03-07", input: 100, output: 50, cached: 10, reasoning: 0, total: 160 },
      { date: "2026-03-08", input: 200, output: 100, cached: 20, reasoning: 0, total: 320 },
    ];

    const heatmap = toHeatmapData(daily);

    expect(heatmap).toEqual([
      { date: "2026-03-07", value: 160 },
      { date: "2026-03-08", value: 320 },
    ]);
  });

  it("should return empty array for empty input", () => {
    expect(toHeatmapData([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toModelAggregates
// ---------------------------------------------------------------------------

describe("toModelAggregates", () => {
  it("should return empty array for empty input", () => {
    expect(toModelAggregates([])).toEqual([]);
  });

  it("should aggregate by source:model key", () => {
    const records = [
      makeRow({ source: "claude-code", model: "sonnet-4", input_tokens: 100, output_tokens: 50, cached_input_tokens: 10, total_tokens: 160 }),
      makeRow({ source: "claude-code", model: "sonnet-4", input_tokens: 200, output_tokens: 100, cached_input_tokens: 20, total_tokens: 320 }),
      makeRow({ source: "opencode", model: "gpt-4.1", input_tokens: 500, output_tokens: 250, cached_input_tokens: 50, total_tokens: 800 }),
    ];

    const result = toModelAggregates(records);

    expect(result).toHaveLength(2);
    // Sorted by total descending
    expect(result[0]!.model).toBe("gpt-4.1");
    expect(result[0]!.source).toBe("opencode");
    expect(result[0]!.total).toBe(800);
    expect(result[1]!.model).toBe("sonnet-4");
    expect(result[1]!.total).toBe(480);
    expect(result[1]!.input).toBe(300);
    expect(result[1]!.output).toBe(150);
    expect(result[1]!.cached).toBe(30);
  });

  it("should sort by total tokens descending", () => {
    const records = [
      makeRow({ source: "a", model: "small", total_tokens: 100 }),
      makeRow({ source: "b", model: "large", total_tokens: 5000 }),
      makeRow({ source: "c", model: "medium", total_tokens: 1000 }),
    ];

    const result = toModelAggregates(records);
    expect(result.map((r) => r.model)).toEqual(["large", "medium", "small"]);
  });
});

// ---------------------------------------------------------------------------
// sourceLabel
// ---------------------------------------------------------------------------

describe("sourceLabel", () => {
  it("should return human-readable names for known sources", () => {
    expect(sourceLabel("claude-code")).toBe("Claude Code");
    expect(sourceLabel("codex")).toBe("Codex");
    expect(sourceLabel("gemini-cli")).toBe("Gemini CLI");
    expect(sourceLabel("opencode")).toBe("OpenCode");
    expect(sourceLabel("openclaw")).toBe("OpenClaw");
  });

  it("should return raw string for unknown sources", () => {
    expect(sourceLabel("something-else")).toBe("something-else");
  });
});

// ---------------------------------------------------------------------------
// toLocalDailyBuckets
// ---------------------------------------------------------------------------

describe("toLocalDailyBuckets", () => {
  it("should return empty array for empty input", () => {
    expect(toLocalDailyBuckets([])).toEqual([]);
  });

  it("should bucket rows by UTC date when tzOffset is 0", () => {
    const rows = [
      makeRow({ hour_start: "2026-03-07T10:00:00Z", total_tokens: 100, input_tokens: 80, output_tokens: 20, cached_input_tokens: 10 }),
      makeRow({ hour_start: "2026-03-07T22:00:00Z", total_tokens: 200, input_tokens: 160, output_tokens: 40, cached_input_tokens: 20 }),
      makeRow({ hour_start: "2026-03-08T05:00:00Z", total_tokens: 300, input_tokens: 240, output_tokens: 60, cached_input_tokens: 30 }),
    ];

    const result = toLocalDailyBuckets(rows, 0);

    expect(result).toHaveLength(2);
    expect(result[0]!.date).toBe("2026-03-07");
    expect(result[0]!.totalTokens).toBe(300);
    expect(result[1]!.date).toBe("2026-03-08");
    expect(result[1]!.totalTokens).toBe(300);
  });

  it("should shift records across midnight for positive tzOffset (west of UTC)", () => {
    // tzOffset=480 means UTC-8 (PST). A record at 2026-03-08T03:00Z is
    // 2026-03-07T19:00 PST — should land in 2026-03-07 bucket.
    const rows = [
      makeRow({ hour_start: "2026-03-08T03:00:00Z", total_tokens: 500, input_tokens: 400, output_tokens: 100, cached_input_tokens: 50 }),
    ];

    const result = toLocalDailyBuckets(rows, 480);

    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe("2026-03-07");
    expect(result[0]!.totalTokens).toBe(500);
  });

  it("should shift records across midnight for negative tzOffset (east of UTC)", () => {
    // tzOffset=-540 means UTC+9 (JST). A record at 2026-03-07T20:00Z is
    // 2026-03-08T05:00 JST — should land in 2026-03-08 bucket.
    const rows = [
      makeRow({ hour_start: "2026-03-07T20:00:00Z", total_tokens: 700, input_tokens: 560, output_tokens: 140, cached_input_tokens: 70 }),
    ];

    const result = toLocalDailyBuckets(rows, -540);

    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe("2026-03-08");
    expect(result[0]!.totalTokens).toBe(700);
  });

  it("should aggregate multiple rows into same local day", () => {
    // Both are UTC-8, same local day 2026-03-07
    const rows = [
      makeRow({ hour_start: "2026-03-07T18:00:00Z", total_tokens: 100, input_tokens: 80, output_tokens: 20, cached_input_tokens: 10 }),
      makeRow({ hour_start: "2026-03-08T02:00:00Z", total_tokens: 200, input_tokens: 160, output_tokens: 40, cached_input_tokens: 20 }),
    ];

    const result = toLocalDailyBuckets(rows, 480);

    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe("2026-03-07");
    expect(result[0]!.totalTokens).toBe(300);
    expect(result[0]!.inputTokens).toBe(240);
    expect(result[0]!.outputTokens).toBe(60);
    expect(result[0]!.cachedTokens).toBe(30);
  });
});
