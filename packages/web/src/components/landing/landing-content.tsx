"use client";

import { useState } from "react";
import {
  Terminal,
  BarChart3,
  Zap,
  Shield,
  Copy,
  Check,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Install command copy button
// ---------------------------------------------------------------------------

function InstallCommand() {
  const command = "bunx @nocoo/pew";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 text-sm font-mono transition-colors hover:border-primary/40 hover:bg-card/80 cursor-pointer"
    >
      <span className="text-muted-foreground">$</span>
      <span className="text-foreground">{command}</span>
      {copied ? (
        <Check className="h-4 w-4 text-success shrink-0" strokeWidth={1.5} />
      ) : (
        <Copy
          className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors"
          strokeWidth={1.5}
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Supported tools
// ---------------------------------------------------------------------------

const TOOLS = [
  { name: "Claude Code", color: "hsl(24 80% 55%)" },
  { name: "Gemini CLI", color: "hsl(210 90% 55%)" },
  { name: "OpenCode", color: "hsl(186 60% 45%)" },
  { name: "OpenClaw", color: "hsl(142 60% 45%)" },
  { name: "Codex", color: "hsl(270 60% 55%)" },
];

// ---------------------------------------------------------------------------
// Feature items
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: Terminal,
    title: "Zero config",
    description:
      "Reads directly from your AI tools' log files. No wrappers, no proxies, no code changes.",
  },
  {
    icon: BarChart3,
    title: "Usage dashboard",
    description:
      "See token usage by day, model, app, and session. Track costs across all your AI coding tools.",
  },
  {
    icon: Zap,
    title: "Instant sync",
    description:
      "One command syncs your local usage data to the cloud. Incremental — only sends new records.",
  },
  {
    icon: Shield,
    title: "Privacy first",
    description:
      "Your conversation content is never read or uploaded. Only token counts and metadata are tracked.",
  },
];

// ---------------------------------------------------------------------------
// Main landing content
// ---------------------------------------------------------------------------

export function LandingContent() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      {/* Hero — left/right split */}
      <section className="grid min-h-[calc(100vh-3.5rem-8rem)] items-center gap-12 py-20 lg:grid-cols-2">
        {/* Left — copy */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            {TOOLS.map((tool) => (
              <span
                key={tool.name}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              >
                {tool.name}
              </span>
            ))}
          </div>

          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Track your AI
            <br />
            <span className="text-primary">token usage</span>
          </h1>

          <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
            Pew reads local log files from your AI coding tools and gives you a
            clear dashboard of token consumption, costs, and trends — without
            touching your conversations.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <InstallCommand />
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Sign in to dashboard
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
        </div>

        {/* Right — visual / feature grid */}
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map((feat) => (
            <div
              key={feat.title}
              className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/20"
            >
              <feat.icon
                className="mb-3 h-5 w-5 text-primary"
                strokeWidth={1.5}
              />
              <h3 className="text-sm font-semibold text-foreground">
                {feat.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/50 py-20">
        <h2 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          How it works
        </h2>
        <p className="mt-2 text-muted-foreground">
          Three steps. Under a minute.
        </p>

        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Install",
              description: "Run bunx @nocoo/pew to install the CLI globally.",
              code: "bunx @nocoo/pew",
            },
            {
              step: "2",
              title: "Login",
              description:
                "Authenticate with your account to link your machine.",
              code: "pew login",
            },
            {
              step: "3",
              title: "Sync",
              description:
                "Upload your token usage. Only metadata — never conversation content.",
              code: "pew sync",
            },
          ].map((item) => (
            <div key={item.step} className="flex flex-col gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                {item.step}
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
              <code className="self-start rounded-lg bg-card border border-border px-3 py-1.5 text-xs font-mono text-foreground">
                $ {item.code}
              </code>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
