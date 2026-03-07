import { defineCommand } from "citty";

const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Set up Zebra hooks for your AI coding tools",
  },
  async run() {
    // TODO: Phase 2 — install hooks for Claude Code, Codex CLI, Gemini CLI, OpenCode, OpenClaw
    console.log("zebra init — not yet implemented");
  },
});

const syncCommand = defineCommand({
  meta: {
    name: "sync",
    description: "Parse local AI tool usage and upload to dashboard",
  },
  async run() {
    // TODO: Phase 2 — parse 5 sources, aggregate into hour buckets, upload
    console.log("zebra sync — not yet implemented");
  },
});

const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show current sync status and token usage summary",
  },
  async run() {
    // TODO: Phase 2 — show cursor positions, last sync time, token totals
    console.log("zebra status — not yet implemented");
  },
});

const loginCommand = defineCommand({
  meta: {
    name: "login",
    description: "Connect your CLI to the Zebra dashboard via browser OAuth",
  },
  async run() {
    // TODO: Phase 3 — browser-based OAuth flow, save token
    console.log("zebra login — not yet implemented");
  },
});

export const main = defineCommand({
  meta: {
    name: "zebra",
    version: "0.1.0",
    description: "Track token usage from your local AI coding tools",
  },
  subCommands: {
    init: initCommand,
    sync: syncCommand,
    status: statusCommand,
    login: loginCommand,
  },
});
