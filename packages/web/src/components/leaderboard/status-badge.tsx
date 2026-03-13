import { cn } from "@/lib/utils";
import type { SeasonStatus } from "@pew/core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATUS_STYLES: Record<SeasonStatus, string> = {
  active:
    "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/25",
  upcoming:
    "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  ended: "bg-muted text-muted-foreground border-border",
};

export const STATUS_LABELS: Record<SeasonStatus, string> = {
  active: "Active",
  upcoming: "Upcoming",
  ended: "Ended",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusBadge({ status }: { status: SeasonStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {status === "active" && (
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}
