/**
 * Leaderboard → Showcases page.
 *
 * Public listing of community-submitted GitHub repositories.
 */

import { Suspense } from "react";
import { auth } from "@/auth";
import { LeaderboardNav } from "@/components/leaderboard/leaderboard-nav";
import { PageHeader } from "@/components/leaderboard/page-header";
import { ShowcasesContent } from "./showcases-content";

export const metadata = {
  title: "Showcases | pew",
  description: "Community-submitted GitHub projects and tools.",
};

export default async function ShowcasesPage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <>
      <PageHeader>
        <h1 className="tracking-tight text-foreground">
          <span className="text-[36px] font-bold font-handwriting leading-none mr-2">pew</span>
          <span className="text-[19px] font-normal text-muted-foreground">
            Showcases
          </span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Community-submitted GitHub projects worth checking out.
        </p>
      </PageHeader>

      <main className="flex-1 py-4 space-y-4">
        <LeaderboardNav />

        <Suspense
          fallback={
            <div className="space-y-3 animate-pulse pt-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[120px] rounded-xl bg-secondary"
                />
              ))}
            </div>
          }
        >
          <ShowcasesContent isLoggedIn={isLoggedIn} />
        </Suspense>
      </main>
    </>
  );
}
