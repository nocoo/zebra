import { describe, it, expect, vi, afterEach } from "vitest";
import {
  PERIOD_OPTIONS,
  periodToDateRange,
  periodLabel,
  formatDate,
  formatMemberSince,
  getMonthRange,
  formatMonth,
} from "@/lib/date-helpers";

// ---------------------------------------------------------------------------
// PERIOD_OPTIONS constant
// ---------------------------------------------------------------------------

describe("PERIOD_OPTIONS", () => {
  it("contains all three period values", () => {
    const values = PERIOD_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["all", "month", "week"]);
  });

  it("has human-readable labels", () => {
    for (const opt of PERIOD_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// periodToDateRange
// ---------------------------------------------------------------------------

describe("periodToDateRange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns from="2020-01-01" for "all"', () => {
    const result = periodToDateRange("all");
    expect(result).toEqual({ from: "2020-01-01" });
  });

  it('returns first day of current month for "month"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15)); // March 15, 2026
    const result = periodToDateRange("month");
    expect(result.from).toBe("2026-03-01");
    expect(result.to).toBeUndefined();
  });

  it('returns last Sunday for "week"', () => {
    vi.useFakeTimers();
    // Wednesday March 11, 2026 — previous Sunday = March 8
    vi.setSystemTime(new Date(2026, 2, 11));
    const result = periodToDateRange("week");
    expect(result.from).toBe("2026-03-08");
  });

  it('returns same day if today is Sunday for "week"', () => {
    vi.useFakeTimers();
    // March 8, 2026 is a Sunday
    vi.setSystemTime(new Date(2026, 2, 8));
    const result = periodToDateRange("week");
    expect(result.from).toBe("2026-03-08");
  });
});

// ---------------------------------------------------------------------------
// periodLabel
// ---------------------------------------------------------------------------

describe("periodLabel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "All time" for "all"', () => {
    expect(periodLabel("all")).toBe("All time");
  });

  it('returns "This week" for "week"', () => {
    expect(periodLabel("week")).toBe("This week");
  });

  it("returns month + year for 'month'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10));
    expect(periodLabel("month")).toBe("March 2026");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
  it('formats "2026-03-10" as a short weekday + month + day', () => {
    const result = formatDate("2026-03-10");
    // "Tue, Mar 10" — exact format varies by locale but should contain these parts
    expect(result).toContain("Mar");
    expect(result).toContain("10");
  });

  it("handles January 1st correctly", () => {
    const result = formatDate("2026-01-01");
    expect(result).toContain("Jan");
    expect(result).toContain("1");
  });
});

// ---------------------------------------------------------------------------
// formatMemberSince
// ---------------------------------------------------------------------------

describe("formatMemberSince", () => {
  it("formats ISO date as month + year", () => {
    const result = formatMemberSince("2025-01-15T12:00:00Z");
    expect(result).toBe("January 2025");
  });

  it("handles date-only strings", () => {
    const result = formatMemberSince("2024-12-25");
    expect(result).toContain("December");
    expect(result).toContain("2024");
  });
});

// ---------------------------------------------------------------------------
// getMonthRange
// ---------------------------------------------------------------------------

describe("getMonthRange", () => {
  it("returns correct range for March 2026", () => {
    const result = getMonthRange(2026, 2); // month is 0-indexed
    expect(result.from).toBe("2026-03-01");
    expect(result.to).toBe("2026-03-31");
  });

  it("handles February in a non-leap year", () => {
    const result = getMonthRange(2025, 1);
    expect(result.from).toBe("2025-02-01");
    expect(result.to).toBe("2025-02-28");
  });

  it("handles February in a leap year", () => {
    const result = getMonthRange(2024, 1);
    expect(result.from).toBe("2024-02-01");
    expect(result.to).toBe("2024-02-29");
  });

  it("handles December (month wrapping)", () => {
    const result = getMonthRange(2026, 11);
    expect(result.from).toBe("2026-12-01");
    expect(result.to).toBe("2026-12-31");
  });
});

// ---------------------------------------------------------------------------
// formatMonth
// ---------------------------------------------------------------------------

describe("formatMonth", () => {
  it("formats March 2026", () => {
    expect(formatMonth(2026, 2)).toBe("March 2026");
  });

  it("formats January 2025", () => {
    expect(formatMonth(2025, 0)).toBe("January 2025");
  });

  it("formats December 2024", () => {
    expect(formatMonth(2024, 11)).toBe("December 2024");
  });
});
