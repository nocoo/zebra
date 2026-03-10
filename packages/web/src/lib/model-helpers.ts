/**
 * Model name formatting helpers extracted from model-breakdown-chart.tsx.
 */

/**
 * Truncate long model names for chart Y-axis labels.
 *
 * Strips common prefixes ("models/") and date suffixes ("-YYYYMMDD"),
 * then truncates to 24 characters with ellipsis.
 */
export function shortModel(model: string): string {
  const cleaned = model
    .replace(/^models\//, "")
    .replace(/-\d{8}$/, "");
  return cleaned.length > 24 ? cleaned.slice(0, 22) + "..." : cleaned;
}
