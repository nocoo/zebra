/**
 * Pure helper functions for device display and chart data transformation.
 *
 * These helpers are used by both the analytics page (/devices) and the
 * management page (/manage-devices). All functions are pure and have no
 * side effects.
 */

import type { DeviceTimelinePoint } from "@pew/core";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** UUID regex — matches standard 8-4-4-4-12 format */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shorten a device_id for display.
 * Returns first 8 chars of UUIDs; returns non-UUIDs unchanged (e.g. "default").
 */
export function shortDeviceId(id: string): string {
  if (!id) return id;
  if (UUID_RE.test(id)) return id.slice(0, 8);
  return id;
}

/**
 * Get the display label for a device.
 * Priority: alias > "Legacy Device" (for default) > short UUID.
 */
export function deviceLabel(device: {
  alias: string | null;
  device_id: string;
}): string {
  if (device.alias) return device.alias;
  if (device.device_id === "default") return "Legacy Device";
  return shortDeviceId(device.device_id);
}

/**
 * Build a Map<device_id, display_label> for chart legend/tooltip lookup.
 */
export function buildDeviceLabelMap(
  devices: Array<{ device_id: string; alias: string | null }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of devices) {
    map.set(d.device_id, deviceLabel(d));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Chart data transformations
// ---------------------------------------------------------------------------

/** Pivoted data point for LineChart — { date, [device_id]: tokens } */
export interface DeviceTrendPoint {
  date: string;
  [deviceId: string]: string | number; // date is string, rest are numbers
}

/**
 * Pivot timeline into trend points keyed by device_id.
 * Used for multi-line LineChart where each line is a device.
 */
export function toDeviceTrendPoints(
  timeline: DeviceTimelinePoint[]
): DeviceTrendPoint[] {
  if (timeline.length === 0) return [];

  const byDate = new Map<string, DeviceTrendPoint>();

  for (const point of timeline) {
    let entry = byDate.get(point.date);
    if (!entry) {
      entry = { date: point.date };
      byDate.set(point.date, entry);
    }
    entry[point.device_id] = point.total_tokens;
  }

  return Array.from(byDate.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  );
}

/** Percentage-based data point for 100% stacked AreaChart */
export interface DeviceSharePoint {
  date: string;
  [deviceId: string]: string | number;
}

/**
 * Convert timeline to percentage-based points for stacked area chart.
 * Each date's device values sum to 100 (percentage).
 */
export function toDeviceSharePoints(
  timeline: DeviceTimelinePoint[]
): DeviceSharePoint[] {
  if (timeline.length === 0) return [];

  // First, group by date and collect device totals
  const byDate = new Map<string, Map<string, number>>();

  for (const point of timeline) {
    let dateMap = byDate.get(point.date);
    if (!dateMap) {
      dateMap = new Map();
      byDate.set(point.date, dateMap);
    }
    dateMap.set(point.device_id, point.total_tokens);
  }

  // Convert to percentage points
  const result: DeviceSharePoint[] = [];

  for (const [date, deviceMap] of byDate) {
    const total = Array.from(deviceMap.values()).reduce((a, b) => a + b, 0);
    const point: DeviceSharePoint = { date };

    for (const [deviceId, tokens] of deviceMap) {
      point[deviceId] = total > 0 ? Math.round((tokens / total) * 100) : 0;
    }

    result.push(point);
  }

  return result.sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  );
}
