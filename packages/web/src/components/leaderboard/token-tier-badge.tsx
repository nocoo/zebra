import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Token Tier Badge
// ---------------------------------------------------------------------------
// Displays a pill badge indicating the magnitude of total token usage:
//   K  = 1,000+       (gray/neutral)
//   M  = 1,000,000+   (teal/primary)
//   B  = 1,000,000,000+ (amber/gold)
// Below 1,000 = nothing rendered.
// ---------------------------------------------------------------------------

type Tier = "K" | "M" | "B";

interface TierConfig {
  label: string;
  className: string;
}

const TIER_CONFIG: Record<Tier, TierConfig> = {
  K: {
    label: "K",
    className: "bg-muted text-muted-foreground",
  },
  M: {
    label: "M",
    className: "bg-primary/15 text-primary",
  },
  B: {
    label: "B",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
};

function resolveTier(totalTokens: number): Tier | null {
  if (totalTokens >= 1_000_000_000) return "B";
  if (totalTokens >= 1_000_000) return "M";
  if (totalTokens >= 1_000) return "K";
  return null;
}

export function TokenTierBadge({ totalTokens }: { totalTokens: number }) {
  const tier = resolveTier(totalTokens);
  if (!tier) return null;

  const config = TIER_CONFIG[tier];

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-1.5 py-px text-[10px] font-bold leading-tight tracking-wide",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}
