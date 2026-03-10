"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreakInfo } from "@/lib/usage-helpers";
import { formatDate } from "@/lib/date-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StreakBadgeProps {
  streak: StreakInfo;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Badge/pill showing current usage streak and longest streak.
 * Displays a flame icon when actively on a streak.
 * Designed to sit near the HeatmapCalendar on the dashboard.
 */
export function StreakBadge({ streak, className }: StreakBadgeProps) {
  const { currentStreak, longestStreak, longestStreakStart, longestStreakEnd, isActiveToday } =
    streak;

  const hasStreak = currentStreak > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] bg-secondary px-4 py-3",
        className,
      )}
    >
      {/* Current streak */}
      <div className="flex items-center gap-1.5">
        <Flame
          className={cn(
            "h-4 w-4",
            hasStreak && isActiveToday
              ? "text-orange-400"
              : "text-muted-foreground",
          )}
          strokeWidth={1.5}
        />
        <span className="text-sm font-medium text-foreground">
          {currentStreak}-day streak
        </span>
        {hasStreak && !isActiveToday && (
          <span className="text-xs text-muted-foreground">(yesterday)</span>
        )}
      </div>

      {/* Separator */}
      {longestStreak > 0 && (
        <span className="text-muted-foreground/40 text-sm">|</span>
      )}

      {/* Longest streak */}
      {longestStreak > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            Longest: {longestStreak} days
          </span>
          <span className="hidden sm:inline">
            ({formatDate(longestStreakStart)} – {formatDate(longestStreakEnd)})
          </span>
        </div>
      )}
    </div>
  );
}
