"use client";

import {
  Flame,
  Trophy,
  Zap,
  DollarSign,
  Calendar,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AchievementState, AchievementTier } from "@/lib/achievement-helpers";

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Flame,
  Trophy,
  Zap,
  DollarSign,
  Calendar,
  Shield,
};

// ---------------------------------------------------------------------------
// Tier color system
// ---------------------------------------------------------------------------

/** Tier → Tailwind classes for ring stroke, icon, and background. */
const TIER_STYLES: Record<AchievementTier, {
  ring: string;      // SVG stroke class
  icon: string;      // Icon color class
  bg: string;        // Background of icon area
  label: string;     // Text color for tier label
}> = {
  locked: {
    ring: "stroke-muted-foreground/20",
    icon: "text-muted-foreground/40",
    bg: "bg-muted/50",
    label: "text-muted-foreground",
  },
  bronze: {
    ring: "stroke-chart-7",
    icon: "text-chart-7",
    bg: "bg-chart-7/10",
    label: "text-chart-7",
  },
  silver: {
    ring: "stroke-chart-2",
    icon: "text-chart-2",
    bg: "bg-chart-2/10",
    label: "text-chart-2",
  },
  gold: {
    ring: "stroke-chart-6",
    icon: "text-chart-6",
    bg: "bg-chart-6/10",
    label: "text-chart-6",
  },
  diamond: {
    ring: "stroke-primary",
    icon: "text-primary",
    bg: "bg-primary/10",
    label: "text-primary",
  },
};

// ---------------------------------------------------------------------------
// Progress Ring SVG (compact — used on the right side of pill cards)
// ---------------------------------------------------------------------------

const RING_SIZE = 36;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface ProgressRingProps {
  progress: number;
  tier: AchievementTier;
  className?: string;
}

function ProgressRing({ progress, tier, className }: ProgressRingProps) {
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  const styles = TIER_STYLES[tier];
  const pct = Math.round(progress * 100);

  return (
    <div className={cn("relative inline-flex items-center justify-center shrink-0", className)}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="-rotate-90"
      >
        {/* Background track */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-muted-foreground/10"
        />
        {/* Progress arc */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          className={cn(styles.ring, "transition-[stroke-dashoffset] duration-700 ease-out")}
        />
      </svg>
      {/* Percentage in center */}
      <span className="absolute text-[9px] font-medium text-muted-foreground">
        {pct}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AchievementBadge — horizontal pill / card
// ---------------------------------------------------------------------------

export interface AchievementBadgeProps {
  achievement: AchievementState;
  className?: string;
}

/**
 * Horizontal pill-style achievement card.
 * Layout: [icon] [title + description] [progress ring]
 *
 * Visual states:
 * - Locked: grey icon, muted text, progress toward first tier
 * - Bronze/Silver/Gold/Diamond: tier-colored icon + ring, clean card
 */
export function AchievementBadge({ achievement, className }: AchievementBadgeProps) {
  const Icon = ICON_MAP[achievement.icon];
  const styles = TIER_STYLES[achievement.tier];
  const isLocked = achievement.tier === "locked";

  const description = isLocked
    ? `${achievement.displayValue} / ${achievement.displayThreshold} ${achievement.unit}`
    : achievement.tier === "diamond"
      ? `${achievement.tierLabel} — max tier`
      : `${achievement.tierLabel} — ${achievement.displayValue} / ${achievement.displayThreshold} ${achievement.unit}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 transition-colors hover:bg-accent/50",
              className,
            )}
          >
            {/* Icon */}
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                styles.bg,
              )}
            >
              {Icon && (
                <Icon
                  className={cn("h-4.5 w-4.5", styles.icon)}
                  strokeWidth={1.5}
                />
              )}
            </div>

            {/* Title + description */}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-xs font-medium leading-tight truncate",
                  isLocked ? "text-muted-foreground/60" : "text-foreground",
                )}
              >
                {achievement.name}
              </p>
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground truncate">
                {description}
              </p>
            </div>

            {/* Progress ring */}
            <ProgressRing progress={achievement.progress} tier={achievement.tier} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px] text-center">
          <p className="font-medium">{achievement.name}</p>
          <p className="mt-0.5 text-[11px] opacity-80">
            {isLocked
              ? `${achievement.displayValue} / ${achievement.displayThreshold} ${achievement.unit}`
              : `${achievement.tierLabel} — ${achievement.displayValue}`}
          </p>
          {!isLocked && achievement.tier !== "diamond" && (
            <p className="mt-0.5 text-[11px] opacity-60">
              Next: {achievement.displayThreshold} {achievement.unit}
            </p>
          )}
          {achievement.tier === "diamond" && (
            <p className="mt-0.5 text-[11px] opacity-60">Max tier reached!</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// AchievementShelf
// ---------------------------------------------------------------------------

export interface AchievementShelfProps {
  achievements: AchievementState[];
  className?: string;
}

/**
 * Grid of horizontal achievement pill cards.
 * Responsive: 1 column on mobile, 2 on sm, 3 on lg.
 */
export function AchievementShelf({ achievements, className }: AchievementShelfProps) {
  if (achievements.length === 0) return null;

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2", className)}>
      {achievements.map((ach) => (
        <AchievementBadge key={ach.id} achievement={ach} />
      ))}
    </div>
  );
}
