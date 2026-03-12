import { describe, it, expect } from "vitest";
import {
  shortDeviceId,
  deviceLabel,
  buildDeviceLabelMap,
  toDeviceTrendPoints,
  toDeviceSharePoints,
} from "@/lib/device-helpers";

// ---------------------------------------------------------------------------
// shortDeviceId
// ---------------------------------------------------------------------------

describe("shortDeviceId", () => {
  it("should return first 8 chars of a UUID", () => {
    expect(shortDeviceId("a3f8c2d1-1234-5678-9abc-def012345678")).toBe(
      "a3f8c2d1"
    );
  });

  it("should return 'default' unchanged", () => {
    expect(shortDeviceId("default")).toBe("default");
  });

  it("should return empty string for empty input", () => {
    expect(shortDeviceId("")).toBe("");
  });

  it("should return short strings unchanged", () => {
    expect(shortDeviceId("abc")).toBe("abc");
  });
});

// ---------------------------------------------------------------------------
// deviceLabel
// ---------------------------------------------------------------------------

describe("deviceLabel", () => {
  it("should return alias when set", () => {
    expect(
      deviceLabel({ alias: "MacBook", device_id: "a3f8c2d1-1234-5678-9abc" })
    ).toBe("MacBook");
  });

  it("should return short UUID when alias is null", () => {
    expect(
      deviceLabel({
        alias: null,
        device_id: "a3f8c2d1-1234-5678-9abc-def012345678",
      })
    ).toBe("a3f8c2d1");
  });

  it("should return 'Legacy Device' for default device without alias", () => {
    expect(deviceLabel({ alias: null, device_id: "default" })).toBe(
      "Legacy Device"
    );
  });

  it("should return alias even for default device when alias is set", () => {
    expect(deviceLabel({ alias: "Old Machine", device_id: "default" })).toBe(
      "Old Machine"
    );
  });
});

// ---------------------------------------------------------------------------
// buildDeviceLabelMap
// ---------------------------------------------------------------------------

describe("buildDeviceLabelMap", () => {
  it("should build a map from device array", () => {
    const devices = [
      { device_id: "aaaa1111-2222-3333-4444-555566667777", alias: "MacBook" },
      { device_id: "bbbb2222-3333-4444-5555-666677778888", alias: null },
      { device_id: "default", alias: null },
    ];

    const map = buildDeviceLabelMap(devices);

    expect(map.get("aaaa1111-2222-3333-4444-555566667777")).toBe("MacBook");
    expect(map.get("bbbb2222-3333-4444-5555-666677778888")).toBe("bbbb2222");
    expect(map.get("default")).toBe("Legacy Device");
  });

  it("should return empty map for empty array", () => {
    const map = buildDeviceLabelMap([]);
    expect(map.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toDeviceTrendPoints
// ---------------------------------------------------------------------------

describe("toDeviceTrendPoints", () => {
  it("should pivot timeline into date-keyed objects with device_id keys", () => {
    const timeline = [
      { date: "2026-03-01", device_id: "dev-a", total_tokens: 1000, input_tokens: 600, output_tokens: 300, cached_input_tokens: 100 },
      { date: "2026-03-01", device_id: "dev-b", total_tokens: 500, input_tokens: 300, output_tokens: 150, cached_input_tokens: 50 },
      { date: "2026-03-02", device_id: "dev-a", total_tokens: 2000, input_tokens: 1200, output_tokens: 600, cached_input_tokens: 200 },
    ];

    const result = toDeviceTrendPoints(timeline);

    expect(result).toHaveLength(2);
    expect(result[0]!.date).toBe("2026-03-01");
    expect(result[0]!["dev-a"]).toBe(1000);
    expect(result[0]!["dev-b"]).toBe(500);
    expect(result[1]!.date).toBe("2026-03-02");
    expect(result[1]!["dev-a"]).toBe(2000);
    expect(result[1]!["dev-b"]).toBeUndefined();
  });

  it("should return empty array for empty timeline", () => {
    expect(toDeviceTrendPoints([])).toEqual([]);
  });

  it("should use device_id as key, not display label", () => {
    const timeline = [
      { date: "2026-03-01", device_id: "default", total_tokens: 100, input_tokens: 60, output_tokens: 30, cached_input_tokens: 10 },
    ];

    const result = toDeviceTrendPoints(timeline);

    expect(result[0]!["default"]).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// toDeviceSharePoints
// ---------------------------------------------------------------------------

describe("toDeviceSharePoints", () => {
  it("should convert to percentage-based points summing to 100", () => {
    const timeline = [
      { date: "2026-03-01", device_id: "dev-a", total_tokens: 750, input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 },
      { date: "2026-03-01", device_id: "dev-b", total_tokens: 250, input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 },
    ];

    const result = toDeviceSharePoints(timeline);

    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe("2026-03-01");
    expect(result[0]!["dev-a"]).toBe(75);
    expect(result[0]!["dev-b"]).toBe(25);
  });

  it("should handle single device as 100%", () => {
    const timeline = [
      { date: "2026-03-01", device_id: "dev-a", total_tokens: 500, input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 },
    ];

    const result = toDeviceSharePoints(timeline);

    expect(result[0]!["dev-a"]).toBe(100);
  });

  it("should return empty array for empty timeline", () => {
    expect(toDeviceSharePoints([])).toEqual([]);
  });

  it("should handle zero total tokens gracefully", () => {
    const timeline = [
      { date: "2026-03-01", device_id: "dev-a", total_tokens: 0, input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 },
    ];

    const result = toDeviceSharePoints(timeline);

    expect(result).toHaveLength(1);
    // When total is 0, percentage should be 0 (not NaN/Infinity)
    expect(result[0]!["dev-a"]).toBe(0);
  });
});
