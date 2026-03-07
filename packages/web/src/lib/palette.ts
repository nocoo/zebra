// Centralized chart / visualization color palette.
// All values reference CSS custom properties defined in globals.css.
// Use these constants everywhere instead of hardcoded color strings.

/** Helper — wraps a CSS custom property name for inline style usage. */
const v = (token: string) => `hsl(var(--${token}))`;

/**
 * Returns a CSS color string with alpha from a CSS custom property.
 * Usage: `withAlpha("chart-1", 0.12)` -> `hsl(var(--chart-1) / 0.12)`
 */
export const withAlpha = (token: string, alpha: number) =>
  `hsl(var(--${token}) / ${alpha})`;

// -- 8 sequential chart colors --

export const chart = {
  teal:      v("chart-1"),  // Brand teal (= --primary)
  sky:       v("chart-2"),
  jade:      v("chart-3"),
  green:     v("chart-4"),
  lime:      v("chart-5"),
  amber:     v("chart-6"),
  orange:    v("chart-7"),
  vermilion: v("chart-8"),
} as const;

/** Ordered array — use for pie / donut / bar where you need N colors by index. */
export const CHART_COLORS = Object.values(chart);

/** CSS variable names (without --) matching CHART_COLORS order — for withAlpha(). */
export const CHART_TOKENS = Array.from({ length: 8 }, (_, i) => `chart-${i + 1}`) as readonly string[];

// -- Semantic aliases --

export const chartAxis = v("chart-axis");
export const chartMuted = v("chart-muted");

/** Positive / success */
export const chartPositive = chart.green;

/** Negative / destructive — reuses the destructive token */
export const chartNegative = v("destructive");

/** Primary chart accent (most-used single color) */
export const chartPrimary = chart.teal;
