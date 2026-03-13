import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for leaderboard rows.
 * @param count Number of skeleton rows (default 10).
 */
export function LeaderboardSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-[var(--radius-card)] bg-secondary px-4 py-4"
        >
          <Skeleton className="h-5 w-8" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <div className="flex-1" />
          <Skeleton className="h-6 w-28" />
        </div>
      ))}
    </div>
  );
}
