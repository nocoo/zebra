"use client";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Period = "all" | "month" | "week";

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "week", label: "This Week" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute from/to date strings for a given period */
export function periodToDateRange(period: Period): { from: string; to?: string } {
  const now = new Date();

  switch (period) {
    case "all":
      return { from: "2020-01-01" };
    case "month": {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: firstOfMonth.toISOString().slice(0, 10) };
    }
    case "week": {
      const day = now.getDay();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - day);
      return { from: sunday.toISOString().slice(0, 10) };
    }
  }
}

export function periodLabel(period: Period): string {
  switch (period) {
    case "all":
      return "All time";
    case "month":
      return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
    case "week":
      return "This week";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PeriodSelectorProps {
  value: Period;
  onChange: (p: Period) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
