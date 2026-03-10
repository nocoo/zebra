"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Terminal,
  BarChart3,
  Zap,
  Shield,
  Copy,
  Check,
} from "lucide-react";

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
      className="group flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 text-sm font-mono transition-colors hover:border-primary/40 hover:bg-card/80 cursor-pointer"
    >
      <span className="text-muted-foreground">$</span>
      <span className="flex-1 text-left text-foreground">{command}</span>
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
  { name: "Claude Code" },
  { name: "Codex" },
  { name: "Gemini CLI" },
  { name: "OpenCode" },
  { name: "OpenClaw" },
];

// ---------------------------------------------------------------------------
// Feature items
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: Terminal,
    title: "Zero config",
    description:
      "Reads directly from your AI tools' log files. No wrappers, no proxies.",
  },
  {
    icon: BarChart3,
    title: "Usage dashboard",
    description:
      "Token usage by day, model, app, and session. Track costs at a glance.",
  },
  {
    icon: Zap,
    title: "Instant sync",
    description:
      "One command uploads new records. Incremental — fast every time.",
  },
  {
    icon: Shield,
    title: "Privacy first",
    description:
      "Conversations are never read. Only token counts and metadata.",
  },
];

// ---------------------------------------------------------------------------
// Main landing content — single viewport, no scroll
// ---------------------------------------------------------------------------

export function LandingContent() {
  return (
    <main className="mx-auto flex max-w-6xl flex-1 items-center px-6">
      <div className="grid w-full gap-12 lg:grid-cols-2">
        {/* Left — copy */}
        <div className="flex flex-col gap-5">
          <Image
            src="/logo-256.png"
            alt="Pew"
            width={256}
            height={256}
            className="h-24 w-24"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {TOOLS.map((tool) => (
              <span
                key={tool.name}
                className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {tool.name}
              </span>
            ))}
          </div>

          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            <span className="inline-flex items-center gap-2">
              <span className="rounded-lg bg-primary/10 px-2.5 py-0.5 text-primary border border-primary/20">
                pew
              </span>
            </span>
            <br />
            Track your AI{" "}
            <span className="text-primary">token usage</span>
          </h1>

          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Pew reads local log files from your AI coding tools and gives you a
            clear dashboard of token consumption, costs, and trends — without
            touching your conversations.
          </p>

          <InstallCommand />
        </div>

        {/* Right — feature grid */}
        <div className="grid grid-cols-2 gap-3 self-center">
          {FEATURES.map((feat) => (
            <div
              key={feat.title}
              className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/20"
            >
              <feat.icon
                className="mb-2 h-5 w-5 text-primary"
                strokeWidth={1.5}
              />
              <h3 className="text-sm font-semibold text-foreground">
                {feat.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
