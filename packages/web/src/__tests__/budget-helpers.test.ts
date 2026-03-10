/**
 * Tests for budget-helpers: computeBudgetStatus.
 */
import { describe, expect, it } from "vitest";
import type { CostForecast } from "@/lib/cost-helpers";
import { computeBudgetStatus } from "@/lib/budget-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeForecast(overrides: Partial<CostForecast> = {}): CostForecast {
  return {
    currentMonthCost: 42,
    projectedMonthCost: 80,
    daysElapsed: 15,
    daysInMonth: 31,
    dailyAverage: 2.8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeBudgetStatus
// ---------------------------------------------------------------------------

describe("computeBudgetStatus", () => {
  it("should compute under-budget status for USD", () => {
    const result = computeBudgetStatus(
      { budget_usd: 100, budget_tokens: null },
      42,
      500_000,
      makeForecast(),
    );

    expect(result.budgetUsd).toBe(100);
    expect(result.spentUsd).toBe(42);
    expect(result.usedPercentUsd).toBe(42);
    expect(result.isOverBudgetUsd).toBe(false);
    expect(result.willExceedUsd).toBe(false);
    expect(result.projectedUsd).toBe(80);
  });

  it("should compute over-budget status for USD", () => {
    const result = computeBudgetStatus(
      { budget_usd: 30, budget_tokens: null },
      42,
      500_000,
      makeForecast(),
    );

    expect(result.usedPercentUsd).toBe(140);
    expect(result.isOverBudgetUsd).toBe(true);
    expect(result.willExceedUsd).toBe(true);
  });

  it("should detect projected overage (under budget now, will exceed)", () => {
    const result = computeBudgetStatus(
      { budget_usd: 50, budget_tokens: null },
      42,
      500_000,
      makeForecast({ projectedMonthCost: 80 }),
    );

    expect(result.isOverBudgetUsd).toBe(false);
    expect(result.willExceedUsd).toBe(true);
    expect(result.projectedUsd).toBe(80);
  });

  it("should compute token budget status", () => {
    const result = computeBudgetStatus(
      { budget_usd: null, budget_tokens: 1_000_000 },
      42,
      700_000,
      makeForecast(),
    );

    expect(result.budgetTokens).toBe(1_000_000);
    expect(result.spentTokens).toBe(700_000);
    expect(result.usedPercentTokens).toBe(70);
    expect(result.isOverBudgetTokens).toBe(false);
  });

  it("should compute over-budget status for tokens", () => {
    const result = computeBudgetStatus(
      { budget_usd: null, budget_tokens: 500_000 },
      42,
      700_000,
      makeForecast(),
    );

    expect(result.usedPercentTokens).toBe(140);
    expect(result.isOverBudgetTokens).toBe(true);
    expect(result.willExceedTokens).toBe(true);
  });

  it("should handle both budgets set", () => {
    const result = computeBudgetStatus(
      { budget_usd: 100, budget_tokens: 1_000_000 },
      42,
      500_000,
      makeForecast(),
    );

    expect(result.budgetUsd).toBe(100);
    expect(result.budgetTokens).toBe(1_000_000);
    expect(result.usedPercentUsd).toBe(42);
    expect(result.usedPercentTokens).toBe(50);
  });

  it("should return 0% when budget is null (no limit)", () => {
    const result = computeBudgetStatus(
      { budget_usd: null, budget_tokens: null },
      42,
      500_000,
      makeForecast(),
    );

    expect(result.usedPercentUsd).toBe(0);
    expect(result.usedPercentTokens).toBe(0);
    expect(result.isOverBudgetUsd).toBe(false);
    expect(result.isOverBudgetTokens).toBe(false);
    expect(result.willExceedUsd).toBe(false);
    expect(result.willExceedTokens).toBe(false);
  });

  it("should project token usage based on forecast ratio", () => {
    // forecast: 15 of 31 days elapsed, so ratio = 31/15
    // projectedTokens = 500_000 * (31/15) ≈ 1_033_333
    const result = computeBudgetStatus(
      { budget_usd: null, budget_tokens: 1_000_000 },
      42,
      500_000,
      makeForecast({ daysElapsed: 15, daysInMonth: 31 }),
    );

    expect(result.projectedTokens).toBeCloseTo(1_033_333, -1);
    expect(result.willExceedTokens).toBe(true);
  });

  it("should handle zero spent", () => {
    const result = computeBudgetStatus(
      { budget_usd: 100, budget_tokens: 1_000_000 },
      0,
      0,
      makeForecast({ currentMonthCost: 0, projectedMonthCost: 0, dailyAverage: 0 }),
    );

    expect(result.usedPercentUsd).toBe(0);
    expect(result.usedPercentTokens).toBe(0);
    expect(result.isOverBudgetUsd).toBe(false);
    expect(result.willExceedUsd).toBe(false);
  });

  it("should handle zero budget (edge case)", () => {
    const result = computeBudgetStatus(
      { budget_usd: 0, budget_tokens: 0 },
      42,
      500_000,
      makeForecast(),
    );

    // Any spend on a zero budget is over budget
    expect(result.isOverBudgetUsd).toBe(true);
    expect(result.isOverBudgetTokens).toBe(true);
  });
});
