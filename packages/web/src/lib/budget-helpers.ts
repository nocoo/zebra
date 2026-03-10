/**
 * Budget status computation helpers.
 *
 * Pure functions for computing budget utilization, projected overages,
 * and alert thresholds. Used by the BudgetProgress and BudgetAlert components.
 */

import type { CostForecast } from "./cost-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetStatus {
  budgetUsd: number | null;
  budgetTokens: number | null;
  spentUsd: number;
  spentTokens: number;
  usedPercentUsd: number; // 0–100+
  usedPercentTokens: number; // 0–100+
  projectedUsd: number; // end-of-month forecast
  projectedTokens: number;
  isOverBudgetUsd: boolean;
  isOverBudgetTokens: boolean;
  willExceedUsd: boolean; // projected > budget
  willExceedTokens: boolean;
}

// ---------------------------------------------------------------------------
// computeBudgetStatus
// ---------------------------------------------------------------------------

/**
 * Compute budget utilization status for the current month.
 *
 * @param budget - Budget limits from user_budgets table (null = no limit)
 * @param currentMonthCost - Total estimated cost so far this month ($)
 * @param currentMonthTokens - Total tokens used so far this month
 * @param forecast - Cost forecast from forecastMonthlyCost()
 */
export function computeBudgetStatus(
  budget: { budget_usd: number | null; budget_tokens: number | null },
  currentMonthCost: number,
  currentMonthTokens: number,
  forecast: CostForecast,
): BudgetStatus {
  const { budget_usd, budget_tokens } = budget;

  // Projected token usage via same linear extrapolation as cost
  const projectedTokens =
    forecast.daysElapsed > 0
      ? currentMonthTokens * (forecast.daysInMonth / forecast.daysElapsed)
      : currentMonthTokens;

  // USD percentages and status
  const usedPercentUsd =
    budget_usd !== null && budget_usd > 0
      ? Math.round((currentMonthCost / budget_usd) * 100)
      : budget_usd === 0 && currentMonthCost > 0
        ? Infinity
        : 0;

  const isOverBudgetUsd =
    budget_usd !== null && currentMonthCost > budget_usd;

  const willExceedUsd =
    budget_usd !== null && forecast.projectedMonthCost > budget_usd;

  // Token percentages and status
  const usedPercentTokens =
    budget_tokens !== null && budget_tokens > 0
      ? Math.round((currentMonthTokens / budget_tokens) * 100)
      : budget_tokens === 0 && currentMonthTokens > 0
        ? Infinity
        : 0;

  const isOverBudgetTokens =
    budget_tokens !== null && currentMonthTokens > budget_tokens;

  const willExceedTokens =
    budget_tokens !== null && projectedTokens > budget_tokens;

  return {
    budgetUsd: budget_usd,
    budgetTokens: budget_tokens,
    spentUsd: currentMonthCost,
    spentTokens: currentMonthTokens,
    usedPercentUsd,
    usedPercentTokens,
    projectedUsd: forecast.projectedMonthCost,
    projectedTokens,
    isOverBudgetUsd,
    isOverBudgetTokens,
    willExceedUsd,
    willExceedTokens,
  };
}
