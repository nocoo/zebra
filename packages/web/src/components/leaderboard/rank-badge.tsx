import { Trophy, Medal, Award } from "lucide-react";

/**
 * Rank decoration — trophy/medal/award icons for top 3, plain number otherwise.
 */
export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return <Trophy className="h-5 w-5 text-yellow-500" strokeWidth={1.5} />;
  }
  if (rank === 2) {
    return <Medal className="h-5 w-5 text-gray-400" strokeWidth={1.5} />;
  }
  if (rank === 3) {
    return <Award className="h-5 w-5 text-amber-600" strokeWidth={1.5} />;
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center text-xs font-medium text-muted-foreground">
      {rank}
    </span>
  );
}
