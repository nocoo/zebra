/**
 * Leaderboard → Showcases page.
 *
 * Public listing of community-submitted GitHub repositories.
 */

import { auth } from "@/auth";
import { LeaderboardNav } from "@/components/leaderboard/leaderboard-nav";
import { LeaderboardPageTitle } from "@/components/leaderboard/leaderboard-page-title";
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
      <LeaderboardPageTitle
        subtitle="Showcases"
        description="Community-submitted GitHub projects worth checking out."
      />

      <main className="flex-1 py-4 space-y-4">
        <LeaderboardNav />
        <ShowcasesContent isLoggedIn={isLoggedIn} />
      </main>
    </>
  );
}
