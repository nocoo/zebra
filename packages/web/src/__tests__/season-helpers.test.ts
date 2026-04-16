import { describe, it, expect } from "vitest";
import {
  getSeasonEndExclusive,
  getSeasonEndExclusiveISO,
  isSeasonEnded,
} from "@/lib/season-helpers";

describe("getSeasonEndExclusive", () => {
  it("should add 60_000ms (1 minute) to the end date", () => {
    const endDate = "2026-03-31T23:59:00Z";
    const result = getSeasonEndExclusive(endDate);
    // Should be 2026-04-01T00:00:00Z
    expect(result).toBe(new Date("2026-04-01T00:00:00Z").getTime());
  });

  it("should handle midnight end date", () => {
    const endDate = "2026-01-01T00:00:00Z";
    const result = getSeasonEndExclusive(endDate);
    expect(result).toBe(new Date("2026-01-01T00:01:00Z").getTime());
  });
});

describe("getSeasonEndExclusiveISO", () => {
  it("should return ISO string with 1 minute added", () => {
    const endDate = "2026-03-31T23:59:00Z";
    const result = getSeasonEndExclusiveISO(endDate);
    expect(result).toBe("2026-04-01T00:00:00.000Z");
  });

  it("should return valid ISO string", () => {
    const result = getSeasonEndExclusiveISO("2026-06-15T12:30:00Z");
    expect(result).toBe("2026-06-15T12:31:00.000Z");
  });
});

describe("isSeasonEnded", () => {
  it("should return true when now is past the exclusive boundary", () => {
    const endDate = "2026-03-31T23:59:00Z";
    // 2 minutes after end_date → past the +1 min boundary
    const now = new Date("2026-04-01T00:01:00Z");
    expect(isSeasonEnded(endDate, now)).toBe(true);
  });

  it("should return false when now is before the exclusive boundary", () => {
    const endDate = "2026-03-31T23:59:00Z";
    // During the end_date minute
    const now = new Date("2026-03-31T23:59:30Z");
    expect(isSeasonEnded(endDate, now)).toBe(false);
  });

  it("should return true when now is exactly at the exclusive boundary", () => {
    const endDate = "2026-03-31T23:59:00Z";
    // Exactly at end_date + 60s
    const now = new Date("2026-04-01T00:00:00Z");
    expect(isSeasonEnded(endDate, now)).toBe(true);
  });

  it("should use current time when now is not provided", () => {
    // Use a far-future end date that hasn't ended
    const endDate = "2099-12-31T23:59:00Z";
    expect(isSeasonEnded(endDate)).toBe(false);
  });

  it("should use current time for a past date", () => {
    const endDate = "2020-01-01T00:00:00Z";
    expect(isSeasonEnded(endDate)).toBe(true);
  });
});
