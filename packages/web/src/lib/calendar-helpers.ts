/**
 * Calendar/heatmap layout helpers extracted from heatmap-calendar.tsx.
 *
 * These are the most algorithmically complex functions in the web package:
 * - getYearWeeks: builds the full Sunday-anchored week grid for a year.
 * - getColorIndex: maps a value to a color bucket index.
 * - formatDateISO: converts a Date to "YYYY-MM-DD".
 */

// ---------------------------------------------------------------------------
// Calendar layout
// ---------------------------------------------------------------------------

/**
 * Build an array of week arrays (Date[][]) covering an entire year,
 * anchored on Sundays. Starts from the first Sunday on or before Jan 1.
 */
export function getYearWeeks(year: number): Date[][] {
  const weeks: Date[][] = [];
  const endDate = new Date(year, 11, 31);

  // Start from first Sunday on or before Jan 1
  const firstDay = new Date(year, 0, 1);
  firstDay.setDate(firstDay.getDate() - firstDay.getDay());

  const currentDate = new Date(firstDay);
  let currentWeek: Date[] = [];

  while (currentDate <= endDate || currentWeek.length > 0) {
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    if (currentDate > endDate) break;

    currentWeek.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  return weeks;
}

// ---------------------------------------------------------------------------
// Color index
// ---------------------------------------------------------------------------

/**
 * Map a numeric value to an index in a color scale array.
 *
 * Index 0 is reserved for zero values (empty/no-data).
 * Non-zero values are linearly distributed across [1..colorScale.length-1].
 */
export function getColorIndex(
  value: number,
  maxValue: number,
  colorScale: readonly string[],
): number {
  if (value === 0) return 0;
  const levels = colorScale.length - 1;
  const normalized = Math.min(value / maxValue, 1);
  return Math.ceil(normalized * levels);
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

/** Format a Date object as an ISO date string "YYYY-MM-DD". */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
