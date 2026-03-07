import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid } from "./stat-card";

/** Loading skeleton for the dashboard overview. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Stat cards skeleton */}
      <StatGrid>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5 space-y-3"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </StatGrid>

      {/* Chart row skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 md:gap-4">
        <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
          <Skeleton className="h-3 w-24 mb-4" />
          <Skeleton className="h-[240px] md:h-[280px] w-full" />
        </div>
        <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
          <Skeleton className="h-3 w-20 mb-4" />
          <div className="flex justify-center">
            <Skeleton className="h-[180px] w-[180px] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
