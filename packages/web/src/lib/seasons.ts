/**
 * Shared season helpers.
 *
 * Season status is derived from dates, never stored in the database.
 */

import type { SeasonStatus } from "@pew/core";

/**
 * Derive season status from start/end dates compared to current UTC date.
 *
 * - today < start_date  → "upcoming"
 * - start_date <= today <= end_date  → "active"
 * - today > end_date  → "ended"
 */
export function deriveSeasonStatus(
  startDate: string,
  endDate: string,
  now?: Date
): SeasonStatus {
  const today = (now ?? new Date()).toISOString().slice(0, 10); // YYYY-MM-DD
  if (today < startDate) return "upcoming";
  if (today > endDate) return "ended";
  return "active";
}
