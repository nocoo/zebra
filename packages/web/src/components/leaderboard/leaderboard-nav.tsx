"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { href: "/leaderboard", label: "Individual" },
  { href: "/leaderboard/seasons", label: "Seasons" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Route-based tab navigation for leaderboard pages.
 * Highlights the active tab based on the current pathname.
 */
export function LeaderboardNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-1 rounded-lg bg-secondary p-1 animate-fade-up"
      style={{ animationDelay: "120ms" }}
      aria-label="Leaderboard navigation"
    >
      {TABS.map((tab) => {
        const isActive = tab.href === "/leaderboard"
          ? pathname === "/leaderboard"
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
