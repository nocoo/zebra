import Link from "next/link";
import Image from "next/image";

/**
 * Shared page header for leaderboard pages — logo + title slot.
 *
 * Each page provides its own title content via the `children` prop so that
 * the season detail page can show the season name instead of a generic title.
 */
export function PageHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="pt-10 pb-2">
      <div
        className="flex items-center gap-5 animate-fade-up"
        style={{ animationDelay: "0ms" }}
      >
        <Link
          href="/"
          className="shrink-0 hover:opacity-80 transition-opacity"
        >
          <Image
            src="/logo-80.png"
            alt="pew"
            width={48}
            height={48}
          />
        </Link>
        <div className="flex flex-col">{children}</div>
      </div>
    </header>
  );
}
