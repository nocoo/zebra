import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid } from "./stat-card";

/** Loading skeleton for the dashboard overview. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Row 1 — Core metrics skeleton (4 cols) */}
      <StatGrid columns={4}>
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

      {/* Row 2 — Economy metrics skeleton (4 cols) */}
      <StatGrid columns={4}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`econ-${i}`}
            className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5 space-y-3"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </StatGrid>

      {/* Achievements skeleton */}
      <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
        <Skeleton className="h-3 w-24 mb-4" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`ach-${i}`} className="flex flex-col items-center gap-1.5 p-3">
              <Skeleton className="h-[72px] w-[72px] rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>

      {/* Charts — left: tab toggle + trend + cache, right: donut + io ratio */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 md:gap-4">
        {/* Left column */}
        <div className="flex flex-col gap-3 md:gap-4">
          <div>
            <Skeleton className="h-8 w-36 mb-3 rounded-lg" />
            <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
              <Skeleton className="h-3 w-24 mb-4" />
              <Skeleton className="h-[240px] md:h-[280px] w-full" />
            </div>
          </div>
          <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
            <Skeleton className="h-3 w-20 mb-4" />
            <Skeleton className="h-[200px] md:h-[240px] w-full" />
          </div>
        </div>
        {/* Right column */}
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
            <Skeleton className="h-3 w-20 mb-4" />
            <div className="flex justify-center">
              <Skeleton className="h-[180px] w-[180px] rounded-full" />
            </div>
          </div>
          <div className="lg:mt-[28px] rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
            <Skeleton className="h-3 w-20 mb-4" />
            <div className="flex justify-center">
              <Skeleton className="h-[180px] w-[180px] rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row — heatmap + weekday/weekend side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
          <Skeleton className="h-3 w-24 mb-4" />
          <Skeleton className="h-[120px] w-full" />
        </div>
        <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
          <Skeleton className="h-3 w-28 mb-4" />
          <Skeleton className="h-[180px] w-full" />
        </div>
      </div>
    </div>
  );
}
