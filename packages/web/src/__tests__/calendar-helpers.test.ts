import { describe, it, expect } from "vitest";
import { getYearWeeks, getColorIndex, formatDateISO } from "@/lib/calendar-helpers";

// ---------------------------------------------------------------------------
// getYearWeeks
// ---------------------------------------------------------------------------

describe("getYearWeeks", () => {
  it("covers all days from Jan 1 through Dec 31", () => {
    const weeks = getYearWeeks(2026);
    const allDates = weeks.flat();

    // Must include Jan 1 and Dec 31
    const dateStrings = allDates.map(formatDateISO);
    expect(dateStrings).toContain("2026-01-01");
    expect(dateStrings).toContain("2026-12-31");
  });

  it("starts each week array on a Sunday", () => {
    const weeks = getYearWeeks(2026);
    for (const week of weeks) {
      // First date in each week should be a Sunday (getDay() === 0)
      // Exception: the last partial week may start on any day
      if (week.length === 7) {
        expect(week[0]!.getDay()).toBe(0);
      }
    }
  });

  it("each full week has exactly 7 days", () => {
    const weeks = getYearWeeks(2026);
    // All weeks except possibly the last should have 7 days
    for (let i = 0; i < weeks.length - 1; i++) {
      expect(weeks[i]!.length).toBe(7);
    }
    // Last week can be partial (1-7 days)
    const last = weeks[weeks.length - 1]!;
    expect(last.length).toBeGreaterThanOrEqual(1);
    expect(last.length).toBeLessThanOrEqual(7);
  });

  it("contains 52 or 53 weeks", () => {
    const weeks = getYearWeeks(2026);
    // A normal year has 52 or 53 weeks depending on start day
    expect(weeks.length).toBeGreaterThanOrEqual(52);
    expect(weeks.length).toBeLessThanOrEqual(54);
  });

  it("dates are in chronological order", () => {
    const weeks = getYearWeeks(2026);
    const allDates = weeks.flat();
    for (let i = 1; i < allDates.length; i++) {
      expect(allDates[i]!.getTime()).toBeGreaterThan(allDates[i - 1]!.getTime());
    }
  });

  it("handles a year where Jan 1 is a Sunday (2023)", () => {
    const weeks = getYearWeeks(2023);
    const first = weeks[0]![0]!;
    expect(first.getDay()).toBe(0);
    expect(formatDateISO(first)).toBe("2023-01-01");
  });

  it("handles a year where Jan 1 is a Saturday (2022)", () => {
    const weeks = getYearWeeks(2022);
    const first = weeks[0]![0]!;
    // Should start from the Sunday before Jan 1 = Dec 26, 2021
    expect(first.getDay()).toBe(0);
    expect(formatDateISO(first)).toBe("2021-12-26");
  });
});

// ---------------------------------------------------------------------------
// getColorIndex
// ---------------------------------------------------------------------------

describe("getColorIndex", () => {
  const scale = ["#empty", "#low", "#med", "#high", "#max"]; // 5 levels

  it("returns 0 for value 0", () => {
    expect(getColorIndex(0, 100, scale)).toBe(0);
  });

  it("returns max index for value equal to maxValue", () => {
    expect(getColorIndex(100, 100, scale)).toBe(4);
  });

  it("clamps values exceeding maxValue", () => {
    expect(getColorIndex(200, 100, scale)).toBe(4);
  });

  it("distributes intermediate values linearly", () => {
    // With 5 levels (0-4), levels = 4
    // value/max = 0.25 → ceil(0.25 * 4) = 1
    expect(getColorIndex(25, 100, scale)).toBe(1);
    // value/max = 0.5 → ceil(0.5 * 4) = 2
    expect(getColorIndex(50, 100, scale)).toBe(2);
    // value/max = 0.75 → ceil(0.75 * 4) = 3
    expect(getColorIndex(75, 100, scale)).toBe(3);
  });

  it("returns 1 for very small non-zero values", () => {
    // value/max = 0.01 → ceil(0.01 * 4) = 1
    expect(getColorIndex(1, 100, scale)).toBe(1);
  });

  it("handles a two-color scale", () => {
    const twoScale = ["#off", "#on"];
    expect(getColorIndex(0, 100, twoScale)).toBe(0);
    expect(getColorIndex(1, 100, twoScale)).toBe(1);
    expect(getColorIndex(100, 100, twoScale)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// formatDateISO
// ---------------------------------------------------------------------------

describe("formatDateISO", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(formatDateISO(new Date(2026, 2, 10))).toBe("2026-03-10");
  });

  it("zero-pads single-digit months and days", () => {
    expect(formatDateISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("handles Dec 31 correctly", () => {
    expect(formatDateISO(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("handles Jan 1 correctly", () => {
    expect(formatDateISO(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});
