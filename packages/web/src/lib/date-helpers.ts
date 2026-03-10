/**
 * Date / period helpers extracted from period-selector.tsx.
 *
 * Pure functions for computing date ranges from period selectors
 * and formatting labels.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Period = "all" | "month" | "week";

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "week", label: "This Week" },
];

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/** Format a local Date as "YYYY-MM-DD" without UTC conversion. */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute from/to date strings for a given period. */
export function periodToDateRange(period: Period): { from: string; to?: string } {
  const now = new Date();

  switch (period) {
    case "all":
      return { from: "2020-01-01" };
    case "month": {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toLocalDateString(firstOfMonth) };
    }
    case "week": {
      const day = now.getDay();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - day);
      return { from: toLocalDateString(sunday) };
    }
  }
}

/** Human-readable label for a period. */
export function periodLabel(period: Period): string {
  switch (period) {
    case "all":
      return "All time";
    case "month":
      return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
    case "week":
      return "This week";
  }
}

/**
 * Format a date string as a human-readable date.
 * E.g. "2026-03-10" → "Tue, Mar 10".
 */
export function formatDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a member-since date string.
 * E.g. "2025-01-15T..." → "January 2025".
 */
export function formatMemberSince(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Get the from/to date strings for a calendar month. */
export function getMonthRange(year: number, month: number): { from: string; to: string } {
  const from = new Date(year, month, 1);
  // Last day of the month
  const to = new Date(year, month + 1, 0);
  return {
    from: toLocalDateString(from),
    to: toLocalDateString(to),
  };
}

/** Format a year+month into a label like "March 2026". */
export function formatMonth(year: number, month: number): string {
  const d = new Date(year, month, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
