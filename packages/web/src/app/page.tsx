import Link from "next/link";
import Image from "next/image";
import { LandingContent } from "@/components/landing/landing-content";

export default function LandingPage() {
  return (
    <div className="relative flex h-screen flex-col bg-background overflow-hidden">
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 60% 50% at 50% 0%,",
            "hsl(186 60% 35% / 0.07) 0%,",
            "hsl(186 60% 35% / 0.03) 40%,",
            "transparent 70%)",
          ].join(" "),
        }}
      />

      {/* Nav */}
      <header className="z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo-24.png" alt="Pew" width={24} height={24} />
            <span className="text-lg font-bold tracking-tighter">pew</span>
          </Link>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/nicnocquee/pew"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <Link
              href="/login"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Main — fills remaining space */}
      <LandingContent />

      {/* Footer — single compact line */}
      <footer className="border-t border-border/50 px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-xs text-muted-foreground">
          <span>pew — AI token usage tracker</span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/nicnocquee/pew"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/@nocoo/pew"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              npm
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
