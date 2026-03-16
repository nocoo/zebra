import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Token Tier Badge — "Asset Notation" style
// ---------------------------------------------------------------------------
// Displays a pill badge using asset-style notation:
//   A4.1  = 1,000–1,999         (4-digit number, leading digit 1)
//   A7.5  = 50,000,000–59,999,999 (7-digit, leading 5)
//   A10.1 = 1,000,000,000+      (10-digit, leading 1)
//
// Colors are grouped by digit count (magnitude):
//   A4–A5  = muted grey    (thousands)
//   A6     = slate/blue    (hundred-thousands)
//   A7     = teal/primary  (millions)
//   A8     = violet        (ten-millions)
//   A9     = amber         (hundred-millions)
//   A10+   = gold          (billions+)
//
// Below 1,000 = nothing rendered.
// ---------------------------------------------------------------------------

interface TierInfo {
  /** Display label, e.g. "A8.3" */
  label: string;
  /** Number of digits = magnitude */
  digits: number;
  /** Leading digit */
  leading: number;
  /** Human-readable tooltip */
  tooltip: string;
}

/** Color class per digit-count tier */
const TIER_COLORS: Record<number, string> = {
  4: "bg-muted text-muted-foreground", // 1K–9.9K
  5: "bg-muted text-muted-foreground", // 10K–99K
  6: "bg-sky-500/15 text-sky-600 dark:text-sky-400", // 100K–999K
  7: "bg-primary/15 text-primary", // 1M–9.9M
  8: "bg-violet-500/15 text-violet-600 dark:text-violet-400", // 10M–99M
  9: "bg-chart-7/15 text-chart-7", // 100M–999M
  10: "bg-amber-500/15 text-amber-600 dark:text-amber-400", // 1B+
};

const MAGNITUDE_NAMES: Record<number, string> = {
  4: "Thousands",
  5: "Ten-thousands",
  6: "Hundred-thousands",
  7: "Millions",
  8: "Ten-millions",
  9: "Hundred-millions",
  10: "Billions",
};

function resolveTier(totalTokens: number): TierInfo | null {
  if (totalTokens < 1_000) return null;

  const digits = Math.floor(Math.log10(totalTokens)) + 1;
  const leading = Math.floor(totalTokens / Math.pow(10, digits - 1));
  // Cap at 10 digits for display
  const displayDigits = Math.min(digits, 10);
  const magnitudeName = MAGNITUDE_NAMES[displayDigits] ?? `${displayDigits}-digit`;

  return {
    label: `A${displayDigits}.${leading}`,
    digits: displayDigits,
    leading,
    tooltip: `${magnitudeName} — ${totalTokens.toLocaleString("en-US")} tokens`,
  };
}

export function TokenTierBadge({ totalTokens }: { totalTokens: number }) {
  const tier = resolveTier(totalTokens);
  if (!tier) return null;

  const colorClass =
    TIER_COLORS[tier.digits] ?? TIER_COLORS[10]; // 10+ all use gold

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full px-1.5 py-px text-[10px] font-bold leading-tight tracking-wide cursor-default",
              colorClass,
            )}
          >
            {tier.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{tier.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
