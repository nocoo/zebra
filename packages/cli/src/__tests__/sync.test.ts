import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeSync, type SyncResult } from "../commands/sync.js";
import type { QueueRecord } from "@pew/core";

/** Helper: create Claude JSONL content */
function claudeLine(ts: string, input: number, output: number): string {
  return JSON.stringify({
    type: "assistant",
    timestamp: ts,
    message: {
      model: "glm-5",
      stop_reason: "end_turn",
      usage: {
        input_tokens: input,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: output,
      },
    },
  });
}

/** Helper: create Gemini session JSON */
function geminiSession(ts: string, input: number, output: number): string {
  return JSON.stringify({
    sessionId: "ses-001",
    messages: [
      {
        id: "msg-1",
        type: "gemini",
        timestamp: ts,
        model: "gemini-3-flash",
        tokens: { input, output, cached: 0, thoughts: 0, tool: 0, total: input + output },
      },
    ],
  });
}

/** Helper: create OpenCode message JSON */
function opencodeMsg(ts: number, input: number, output: number): string {
  return JSON.stringify({
    id: "msg_001",
    sessionID: "ses_001",
    role: "assistant",
    modelID: "claude-opus-4.6",
    time: { created: ts, completed: ts + 1000 },
    tokens: {
      total: input + output,
      input,
      output,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  });
}

/** Helper: create OpenClaw JSONL line */
function openclawLine(ts: string, input: number, output: number): string {
  return JSON.stringify({
    type: "message",
    timestamp: ts,
    message: {
      model: "claude-sonnet-4",
      usage: {
        input,
        cacheRead: 0,
        cacheWrite: 0,
        output,
        totalTokens: input + output,
      },
    },
  });
}

/** Helper: create Codex CLI JSONL content (session_meta + turn_context + token_count) */
function codexLines(ts: string, input: number, output: number): string {
  const meta = JSON.stringify({
    timestamp: ts,
    type: "session_meta",
    payload: { id: "ses-codex-001", cwd: "/tmp/project", model: "gpt-5.4" },
  });
  const ctx = JSON.stringify({
    timestamp: ts,
    type: "turn_context",
    payload: { model: "gpt-5.4", cwd: "/tmp/project" },
  });
  const tok = JSON.stringify({
    timestamp: ts,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: 0,
          output_tokens: output,
          reasoning_output_tokens: 0,
          total_tokens: input + output,
        },
      },
    },
  });
  return [meta, ctx, tok].join("\n");
}

describe("executeSync", () => {
  let tempDir: string;
  let dataDir: string;
  let stateDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pew-sync-test-"));
    dataDir = join(tempDir, "data");
    stateDir = join(tempDir, "state");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should sync Claude data files to queue", async () => {
    // Set up Claude data
    const claudeDir = join(dataDir, ".claude", "projects", "proj-a");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, "session.jsonl"),
      claudeLine("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    const result = await executeSync({
      stateDir,
      claudeDir: join(dataDir, ".claude"),
    });

    expect(result.totalDeltas).toBe(1);
    expect(result.totalRecords).toBe(1);
    expect(result.sources.claude).toBe(1);
    expect(result.filesScanned.claude).toBe(1);

    // Verify queue file was created
    const queueRaw = await readFile(join(stateDir, "queue.jsonl"), "utf-8");
    const records = queueRaw.trim().split("\n").map((l) => JSON.parse(l) as QueueRecord);
    expect(records).toHaveLength(1);
    expect(records[0].source).toBe("claude-code");
    expect(records[0].model).toBe("glm-5");
    expect(records[0].input_tokens).toBe(5000);
    expect(records[0].output_tokens).toBe(800);
    expect(records[0].hour_start).toBe("2026-03-07T10:00:00.000Z");
  });

  it("should sync Gemini data files to queue", async () => {
    const geminiDir = join(dataDir, ".gemini", "tmp", "proj-b", "chats");
    await mkdir(geminiDir, { recursive: true });
    await writeFile(
      join(geminiDir, "session-2026-03-07.json"),
      geminiSession("2026-03-07T10:15:00.000Z", 3000, 200),
    );

    const result = await executeSync({
      stateDir,
      geminiDir: join(dataDir, ".gemini"),
    });

    expect(result.totalDeltas).toBe(1);
    expect(result.sources.gemini).toBe(1);
    expect(result.filesScanned.gemini).toBe(1);
  });

  it("should sync OpenCode data files to queue", async () => {
    const ocDir = join(dataDir, "opencode", "message", "ses_001");
    await mkdir(ocDir, { recursive: true });
    await writeFile(
      join(ocDir, "msg_001.json"),
      opencodeMsg(1771120749059, 14967, 437),
    );

    const result = await executeSync({
      stateDir,
      openCodeMessageDir: join(dataDir, "opencode", "message"),
    });

    expect(result.totalDeltas).toBe(1);
    expect(result.sources.opencode).toBe(1);
    expect(result.filesScanned.opencode).toBe(1);
  });

  it("should sync OpenClaw data files to queue", async () => {
    const agentDir = join(dataDir, ".openclaw", "agents", "a1", "sessions");
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, "session.jsonl"),
      openclawLine("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    const result = await executeSync({
      stateDir,
      openclawDir: join(dataDir, ".openclaw"),
    });

    expect(result.totalDeltas).toBe(1);
    expect(result.sources.openclaw).toBe(1);
    expect(result.filesScanned.openclaw).toBe(1);
  });

  it("should be incremental (second sync produces no new records)", async () => {
    const claudeDir = join(dataDir, ".claude", "projects", "proj-a");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, "session.jsonl"),
      claudeLine("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    const r1 = await executeSync({
      stateDir,
      claudeDir: join(dataDir, ".claude"),
    });
    expect(r1.totalDeltas).toBe(1);

    // Second sync: no new data
    const r2 = await executeSync({
      stateDir,
      claudeDir: join(dataDir, ".claude"),
    });
    expect(r2.totalDeltas).toBe(0);
    expect(r2.totalRecords).toBe(0);
  });

  it("should aggregate multiple deltas into one bucket record", async () => {
    const claudeDir = join(dataDir, ".claude", "projects", "proj-a");
    await mkdir(claudeDir, { recursive: true });
    // Two events in the same half-hour bucket, same model
    const content = [
      claudeLine("2026-03-07T10:05:00.000Z", 1000, 100),
      claudeLine("2026-03-07T10:20:00.000Z", 2000, 200),
    ].join("\n") + "\n";
    await writeFile(join(claudeDir, "session.jsonl"), content);

    const result = await executeSync({
      stateDir,
      claudeDir: join(dataDir, ".claude"),
    });

    expect(result.totalDeltas).toBe(2);
    expect(result.totalRecords).toBe(1); // aggregated into one bucket

    const queueRaw = await readFile(join(stateDir, "queue.jsonl"), "utf-8");
    const records = queueRaw.trim().split("\n").map((l) => JSON.parse(l) as QueueRecord);
    expect(records).toHaveLength(1);
    expect(records[0].input_tokens).toBe(3000); // 1000 + 2000
    expect(records[0].output_tokens).toBe(300); // 100 + 200
  });

  it("should handle no data directories at all", async () => {
    const result = await executeSync({ stateDir });
    expect(result.totalDeltas).toBe(0);
    expect(result.totalRecords).toBe(0);
  });

  it("should sync multiple sources in one run", async () => {
    // Claude
    const claudeDir = join(dataDir, ".claude", "projects", "proj-a");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, "session.jsonl"),
      claudeLine("2026-03-07T10:15:00.000Z", 1000, 100) + "\n",
    );
    // Gemini
    const geminiDir = join(dataDir, ".gemini", "tmp", "proj-b", "chats");
    await mkdir(geminiDir, { recursive: true });
    await writeFile(
      join(geminiDir, "session-2026-03-07.json"),
      geminiSession("2026-03-07T10:15:00.000Z", 2000, 200),
    );

    const result = await executeSync({
      stateDir,
      claudeDir: join(dataDir, ".claude"),
      geminiDir: join(dataDir, ".gemini"),
    });

    expect(result.totalDeltas).toBe(2);
    expect(result.sources.claude).toBe(1);
    expect(result.sources.gemini).toBe(1);
  });

  // ===== Codex CLI sync =====

  it("should sync Codex data files to queue", async () => {
    const codexDir = join(dataDir, ".codex", "sessions", "2026", "03", "07");
    await mkdir(codexDir, { recursive: true });
    await writeFile(
      join(codexDir, "rollout-abc123.jsonl"),
      codexLines("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    const result = await executeSync({
      stateDir,
      codexSessionsDir: join(dataDir, ".codex", "sessions"),
    });

    expect(result.totalDeltas).toBe(1);
    expect(result.totalRecords).toBe(1);
    expect(result.sources.codex).toBe(1);
    expect(result.filesScanned.codex).toBe(1);

    // Verify queue file was created
    const queueRaw = await readFile(join(stateDir, "queue.jsonl"), "utf-8");
    const records = queueRaw.trim().split("\n").map((l) => JSON.parse(l) as QueueRecord);
    expect(records).toHaveLength(1);
    expect(records[0].source).toBe("codex");
    expect(records[0].model).toBe("gpt-5.4");
    expect(records[0].input_tokens).toBe(5000);
    expect(records[0].output_tokens).toBe(800);
  });

  it("should be incremental for Codex (second sync with no changes produces no new data)", async () => {
    const codexDir = join(dataDir, ".codex", "sessions", "2026", "03", "07");
    await mkdir(codexDir, { recursive: true });
    await writeFile(
      join(codexDir, "rollout-abc123.jsonl"),
      codexLines("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    const r1 = await executeSync({
      stateDir,
      codexSessionsDir: join(dataDir, ".codex", "sessions"),
    });
    expect(r1.totalDeltas).toBe(1);
    expect(r1.sources.codex).toBe(1);

    // Second sync: no new data
    const r2 = await executeSync({
      stateDir,
      codexSessionsDir: join(dataDir, ".codex", "sessions"),
    });
    expect(r2.totalDeltas).toBe(0);
    expect(r2.totalRecords).toBe(0);
  });

  it("should sync only new Codex lines appended after first sync", async () => {
    const codexDir = join(dataDir, ".codex", "sessions", "2026", "03", "07");
    await mkdir(codexDir, { recursive: true });
    const filePath = join(codexDir, "rollout-abc123.jsonl");
    await writeFile(
      filePath,
      codexLines("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    const r1 = await executeSync({
      stateDir,
      codexSessionsDir: join(dataDir, ".codex", "sessions"),
    });
    expect(r1.totalDeltas).toBe(1);

    // Append a new token_count line (cumulative totals increase)
    const existing = await readFile(filePath, "utf-8");
    const newTokenLine = JSON.stringify({
      timestamp: "2026-03-07T11:15:00.000Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 8000,
            cached_input_tokens: 0,
            output_tokens: 1200,
            reasoning_output_tokens: 0,
            total_tokens: 9200,
          },
        },
      },
    });
    await writeFile(filePath, existing + newTokenLine + "\n");

    const r2 = await executeSync({
      stateDir,
      codexSessionsDir: join(dataDir, ".codex", "sessions"),
    });
    // Should get the diff: 8000-5000=3000 input, 1200-800=400 output
    expect(r2.totalDeltas).toBe(1);
    expect(r2.sources.codex).toBe(1);

    const queueRaw = await readFile(join(stateDir, "queue.jsonl"), "utf-8");
    const records = queueRaw.trim().split("\n").map((l) => JSON.parse(l) as QueueRecord);
    // Second record should be the diff
    const codexRecords = records.filter((r) => r.source === "codex");
    expect(codexRecords).toHaveLength(2);
    // The second record should have the diff tokens
    expect(codexRecords[1].input_tokens).toBe(3000);
    expect(codexRecords[1].output_tokens).toBe(400);
  });

  // ===== OpenCode incremental sync + triple-check skip =====

  it("should be incremental for OpenCode (second sync with no file changes skips parsing)", async () => {
    const ocDir = join(dataDir, "opencode", "message", "ses_001");
    await mkdir(ocDir, { recursive: true });
    await writeFile(
      join(ocDir, "msg_001.json"),
      opencodeMsg(1771120749059, 14967, 437),
    );

    const r1 = await executeSync({
      stateDir,
      openCodeMessageDir: join(dataDir, "opencode", "message"),
    });
    expect(r1.totalDeltas).toBe(1);
    expect(r1.sources.opencode).toBe(1);

    // Second sync: file unchanged → triple-check (inode+size+mtime) should skip
    const r2 = await executeSync({
      stateDir,
      openCodeMessageDir: join(dataDir, "opencode", "message"),
    });
    expect(r2.totalDeltas).toBe(0);
    expect(r2.totalRecords).toBe(0);
    expect(r2.sources.opencode).toBe(0);
  });

  it("should detect new OpenCode file added to existing session directory", async () => {
    // OpenCode message files are immutable — new messages create new files.
    // Directory mtime changes when a new file is created, triggering re-scan.
    const ocDir = join(dataDir, "opencode", "message", "ses_001");
    await mkdir(ocDir, { recursive: true });
    await writeFile(join(ocDir, "msg_001.json"), opencodeMsg(1771120749059, 100, 50));

    const r1 = await executeSync({
      stateDir,
      openCodeMessageDir: join(dataDir, "opencode", "message"),
    });
    expect(r1.totalDeltas).toBe(1);

    // Wait to ensure mtime differs, then add a NEW file (simulating a new message)
    await new Promise((r) => setTimeout(r, 50));
    await writeFile(join(ocDir, "msg_002.json"), opencodeMsg(1771120799059, 200, 100));

    const r2 = await executeSync({
      stateDir,
      openCodeMessageDir: join(dataDir, "opencode", "message"),
    });
    // New file in directory → directory mtime changed → re-scan → find new file
    expect(r2.totalDeltas).toBe(1);
    expect(r2.sources.opencode).toBe(1);
  });

  // ===== OpenClaw incremental sync =====

  it("should be incremental for OpenClaw (second sync with no changes produces no new data)", async () => {
    const agentDir = join(dataDir, ".openclaw", "agents", "a1", "sessions");
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, "session.jsonl"),
      openclawLine("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    const r1 = await executeSync({
      stateDir,
      openclawDir: join(dataDir, ".openclaw"),
    });
    expect(r1.totalDeltas).toBe(1);
    expect(r1.sources.openclaw).toBe(1);

    // Second sync: no new data
    const r2 = await executeSync({
      stateDir,
      openclawDir: join(dataDir, ".openclaw"),
    });
    expect(r2.totalDeltas).toBe(0);
    expect(r2.totalRecords).toBe(0);
  });

  it("should sync only new OpenClaw lines appended after first sync", async () => {
    const agentDir = join(dataDir, ".openclaw", "agents", "a1", "sessions");
    await mkdir(agentDir, { recursive: true });
    const filePath = join(agentDir, "session.jsonl");
    await writeFile(
      filePath,
      openclawLine("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    const r1 = await executeSync({
      stateDir,
      openclawDir: join(dataDir, ".openclaw"),
    });
    expect(r1.totalDeltas).toBe(1);

    // Append new line
    const existing = await readFile(filePath, "utf-8");
    await writeFile(
      filePath,
      existing + openclawLine("2026-03-07T11:15:00.000Z", 3000, 400) + "\n",
    );

    const r2 = await executeSync({
      stateDir,
      openclawDir: join(dataDir, ".openclaw"),
    });
    expect(r2.totalDeltas).toBe(1);
    expect(r2.sources.openclaw).toBe(1);
  });

  // ===== Progress callback coverage =====

  it("should fire progress events for all phases", async () => {
    const claudeDir = join(dataDir, ".claude", "projects", "proj-a");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, "session.jsonl"),
      claudeLine("2026-03-07T10:15:00.000Z", 1000, 100) + "\n",
    );

    const events: Array<{ source: string; phase: string }> = [];

    await executeSync({
      stateDir,
      claudeDir: join(dataDir, ".claude"),
      onProgress: (e) => events.push({ source: e.source, phase: e.phase }),
    });

    // Should have: discover, parse (announce), parse (per-file), aggregate, done
    expect(events.some((e) => e.source === "claude-code" && e.phase === "discover")).toBe(true);
    expect(events.some((e) => e.source === "claude-code" && e.phase === "parse")).toBe(true);
    expect(events.some((e) => e.source === "all" && e.phase === "aggregate")).toBe(true);
    expect(events.some((e) => e.source === "all" && e.phase === "done")).toBe(true);
  });

  it("should fire progress events for OpenCode sync including dir-level skip", async () => {
    const ocDir = join(dataDir, "opencode", "message", "ses_001");
    await mkdir(ocDir, { recursive: true });
    await writeFile(
      join(ocDir, "msg_001.json"),
      opencodeMsg(1771120749059, 14967, 437),
    );

    // First sync to populate cursors and dirMtimes
    await executeSync({
      stateDir,
      openCodeMessageDir: join(dataDir, "opencode", "message"),
    });

    // Second sync: dir-level mtime skip means 0 files discovered in changed dirs
    const events: Array<{ source: string; phase: string; current?: number; total?: number; message?: string }> = [];
    await executeSync({
      stateDir,
      openCodeMessageDir: join(dataDir, "opencode", "message"),
      onProgress: (e) => events.push({ source: e.source, phase: e.phase, current: e.current, total: e.total, message: e.message }),
    });

    expect(events.some((e) => e.source === "opencode" && e.phase === "discover")).toBe(true);
    expect(events.some((e) => e.source === "opencode" && e.phase === "parse")).toBe(true);
    // With dir-level mtime optimization, total files should be 0 (entire dir skipped)
    const parseEvent = events.find((e) => e.source === "opencode" && e.phase === "parse" && e.total !== undefined);
    expect(parseEvent?.total).toBe(0);
    expect(parseEvent?.message).toContain("1 dirs skipped");
  });

  // ===== All five sources in one run =====

  it("should fire progress events for all five sources", async () => {
    // Claude
    const claudeDir = join(dataDir, ".claude", "projects", "proj-a");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, "session.jsonl"),
      claudeLine("2026-03-07T10:15:00.000Z", 1000, 100) + "\n",
    );
    // Gemini
    const geminiDir = join(dataDir, ".gemini", "tmp", "proj-b", "chats");
    await mkdir(geminiDir, { recursive: true });
    await writeFile(
      join(geminiDir, "session-2026-03-07.json"),
      geminiSession("2026-03-07T10:15:00.000Z", 2000, 200),
    );
    // OpenCode
    const ocDir = join(dataDir, "opencode", "message", "ses_001");
    await mkdir(ocDir, { recursive: true });
    await writeFile(
      join(ocDir, "msg_001.json"),
      opencodeMsg(1771120749059, 14967, 437),
    );
    // OpenClaw
    const agentDir = join(dataDir, ".openclaw", "agents", "a1", "sessions");
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, "session.jsonl"),
      openclawLine("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );
    // Codex
    const codexDir = join(dataDir, ".codex", "sessions", "2026", "03", "07");
    await mkdir(codexDir, { recursive: true });
    await writeFile(
      join(codexDir, "rollout-abc123.jsonl"),
      codexLines("2026-03-07T10:15:00.000Z", 3000, 500) + "\n",
    );

    const events: Array<{ source: string; phase: string }> = [];

    await executeSync({
      stateDir,
      claudeDir: join(dataDir, ".claude"),
      geminiDir: join(dataDir, ".gemini"),
      openCodeMessageDir: join(dataDir, "opencode", "message"),
      openclawDir: join(dataDir, ".openclaw"),
      codexSessionsDir: join(dataDir, ".codex", "sessions"),
      onProgress: (e) => events.push({ source: e.source, phase: e.phase }),
    });

    // Verify all five sources emit discover + parse events
    expect(events.some((e) => e.source === "claude-code" && e.phase === "discover")).toBe(true);
    expect(events.some((e) => e.source === "claude-code" && e.phase === "parse")).toBe(true);
    expect(events.some((e) => e.source === "gemini-cli" && e.phase === "discover")).toBe(true);
    expect(events.some((e) => e.source === "gemini-cli" && e.phase === "parse")).toBe(true);
    expect(events.some((e) => e.source === "opencode" && e.phase === "discover")).toBe(true);
    expect(events.some((e) => e.source === "opencode" && e.phase === "parse")).toBe(true);
    expect(events.some((e) => e.source === "openclaw" && e.phase === "discover")).toBe(true);
    expect(events.some((e) => e.source === "openclaw" && e.phase === "parse")).toBe(true);
    expect(events.some((e) => e.source === "codex" && e.phase === "discover")).toBe(true);
    expect(events.some((e) => e.source === "codex" && e.phase === "parse")).toBe(true);
    expect(events.some((e) => e.source === "all" && e.phase === "aggregate")).toBe(true);
    expect(events.some((e) => e.source === "all" && e.phase === "done")).toBe(true);
  });

  // ===== Error isolation tests =====

  it("should continue syncing other Claude files when one file's parser throws", async () => {
    // Set up two Claude project dirs with one file each
    const proj1 = join(dataDir, ".claude", "projects", "proj-good");
    const proj2 = join(dataDir, ".claude", "projects", "proj-bad");
    await mkdir(proj1, { recursive: true });
    await mkdir(proj2, { recursive: true });

    // Good file: valid JSONL
    await writeFile(
      join(proj1, "session.jsonl"),
      claudeLine("2026-03-07T10:15:00.000Z", 1000, 100) + "\n",
    );

    // Bad file: starts with valid-looking content but will cause readline to
    // emit a line that triggers an unhandled error deeper in the parser.
    // We write binary content that createReadStream will read but cannot
    // be processed by readline without error on certain Node versions.
    // Instead, we use vi.spyOn to make the parser throw for one specific file.
    await writeFile(
      join(proj2, "bad.jsonl"),
      claudeLine("2026-03-07T10:15:00.000Z", 2000, 200) + "\n",
    );

    // Spy on the parser module to throw for the bad file path
    const claudeParser = await import("../parsers/claude.js");
    const origParse = claudeParser.parseClaudeFile;
    const spy = vi.spyOn(claudeParser, "parseClaudeFile").mockImplementation(
      async (opts) => {
        if (opts.filePath.includes("proj-bad")) {
          throw new Error("Simulated parser explosion");
        }
        return origParse(opts);
      },
    );

    // Collect progress events to verify warning is emitted
    const events: Array<{ source: string; phase: string; message?: string }> = [];

    try {
      const result = await executeSync({
        stateDir,
        claudeDir: join(dataDir, ".claude"),
        onProgress: (e) => events.push({ source: e.source, phase: e.phase, message: e.message }),
      });

      // The good file's data should still be synced
      expect(result.totalDeltas).toBe(1);
      expect(result.sources.claude).toBe(1);

      // Verify queue was written (not lost)
      const queueRaw = await readFile(join(stateDir, "queue.jsonl"), "utf-8");
      const records = queueRaw.trim().split("\n").map((l) => JSON.parse(l) as QueueRecord);
      expect(records).toHaveLength(1);
      expect(records[0].input_tokens).toBe(1000);

      // Verify a warning was emitted for the bad file
      expect(events.some((e) => e.phase === "warn")).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("should continue syncing other sources when one source's parser throws", async () => {
    // Claude: will have a file that throws
    const claudeDir = join(dataDir, ".claude", "projects", "proj-a");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, "session.jsonl"),
      claudeLine("2026-03-07T10:15:00.000Z", 1000, 100) + "\n",
    );

    // OpenClaw: healthy data
    const agentDir = join(dataDir, ".openclaw", "agents", "a1", "sessions");
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, "session.jsonl"),
      openclawLine("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    // Make ALL Claude parses throw
    const claudeParser = await import("../parsers/claude.js");
    const spy = vi.spyOn(claudeParser, "parseClaudeFile").mockRejectedValue(
      new Error("Claude parser crash"),
    );

    try {
      const result = await executeSync({
        stateDir,
        claudeDir: join(dataDir, ".claude"),
        openclawDir: join(dataDir, ".openclaw"),
      });

      // OpenClaw data should still be synced despite Claude failure
      expect(result.sources.openclaw).toBe(1);
      expect(result.totalRecords).toBeGreaterThanOrEqual(1);

      // Verify queue has the OpenClaw record
      const queueRaw = await readFile(join(stateDir, "queue.jsonl"), "utf-8");
      const records = queueRaw.trim().split("\n").map((l) => JSON.parse(l) as QueueRecord);
      expect(records.some((r) => r.source === "openclaw")).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  // ===== Write-order resilience tests (HIGH-2) =====

  it("should save cursors before queue so crash after cursor save does not cause double-counting", async () => {
    // This test verifies that cursors are persisted BEFORE the queue,
    // so if the process crashes after cursor save but before queue write,
    // the next sync will NOT re-parse already-processed data.
    const claudeDir = join(dataDir, ".claude", "projects", "proj-a");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, "session.jsonl"),
      claudeLine("2026-03-07T10:15:00.000Z", 1000, 100) + "\n",
    );

    // Import the LocalQueue module to spy on appendBatch
    const localQueueModule = await import("../storage/local-queue.js");
    const origAppendBatch = localQueueModule.LocalQueue.prototype.appendBatch;

    // First sync: let appendBatch throw AFTER the cursor should be saved
    // (simulating a crash between cursor save and queue write)
    let appendBatchCalled = false;
    const spy = vi.spyOn(localQueueModule.LocalQueue.prototype, "appendBatch")
      .mockImplementation(async function(this: InstanceType<typeof localQueueModule.LocalQueue>, _records) {
        appendBatchCalled = true;
        throw new Error("Simulated crash during queue write");
      });

    try {
      await executeSync({
        stateDir,
        claudeDir: join(dataDir, ".claude"),
      }).catch(() => {
        // Expected to throw due to queue write failure
      });
    } finally {
      spy.mockRestore();
    }

    expect(appendBatchCalled).toBe(true);

    // Check if cursors were saved (they should be, because cursor save
    // should happen BEFORE queue write)
    const { CursorStore } = await import("../storage/cursor-store.js");
    const cursorStore = new CursorStore(stateDir);
    const cursors = await cursorStore.load();
    const cursorKeys = Object.keys(cursors.files);
    expect(cursorKeys.length).toBeGreaterThan(0); // cursors were persisted

    // Second sync: normal operation, should produce NO new deltas
    // because cursors already advanced past the data
    const result = await executeSync({
      stateDir,
      claudeDir: join(dataDir, ".claude"),
    });

    expect(result.totalDeltas).toBe(0);
    expect(result.totalRecords).toBe(0);

    // Queue should have 0 records: first sync's queue write was blocked
    // by our mock, and second sync found no new data to write.
    let queueRecordCount = 0;
    try {
      const queueRaw = await readFile(join(stateDir, "queue.jsonl"), "utf-8");
      queueRecordCount = queueRaw.trim().split("\n").filter((l) => l.length > 0).length;
    } catch {
      // queue.jsonl doesn't exist — that's fine, means 0 records
    }
    expect(queueRecordCount).toBe(0);
  });

  it("should sync all five sources simultaneously", async () => {
    // Claude
    const claudeDir = join(dataDir, ".claude", "projects", "proj-a");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, "session.jsonl"),
      claudeLine("2026-03-07T10:15:00.000Z", 1000, 100) + "\n",
    );
    // Gemini
    const geminiDir = join(dataDir, ".gemini", "tmp", "proj-b", "chats");
    await mkdir(geminiDir, { recursive: true });
    await writeFile(
      join(geminiDir, "session-2026-03-07.json"),
      geminiSession("2026-03-07T10:15:00.000Z", 2000, 200),
    );
    // OpenCode
    const ocDir = join(dataDir, "opencode", "message", "ses_001");
    await mkdir(ocDir, { recursive: true });
    await writeFile(
      join(ocDir, "msg_001.json"),
      opencodeMsg(1771120749059, 14967, 437),
    );
    // OpenClaw
    const agentDir = join(dataDir, ".openclaw", "agents", "a1", "sessions");
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, "session.jsonl"),
      openclawLine("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );
    // Codex
    const codexDir = join(dataDir, ".codex", "sessions", "2026", "03", "07");
    await mkdir(codexDir, { recursive: true });
    await writeFile(
      join(codexDir, "rollout-abc123.jsonl"),
      codexLines("2026-03-07T10:15:00.000Z", 3000, 500) + "\n",
    );

    const result = await executeSync({
      stateDir,
      claudeDir: join(dataDir, ".claude"),
      geminiDir: join(dataDir, ".gemini"),
      openCodeMessageDir: join(dataDir, "opencode", "message"),
      openclawDir: join(dataDir, ".openclaw"),
      codexSessionsDir: join(dataDir, ".codex", "sessions"),
    });

    expect(result.totalDeltas).toBe(5);
    expect(result.sources.claude).toBe(1);
    expect(result.sources.gemini).toBe(1);
    expect(result.sources.opencode).toBe(1);
    expect(result.sources.openclaw).toBe(1);
    expect(result.sources.codex).toBe(1);
    expect(result.filesScanned.claude).toBe(1);
    expect(result.filesScanned.gemini).toBe(1);
    expect(result.filesScanned.opencode).toBe(1);
    expect(result.filesScanned.openclaw).toBe(1);
    expect(result.filesScanned.codex).toBe(1);
  });

  // ===== OpenCode SQLite integration =====

  /**
   * Helper: create a mock openMessageDb factory that returns rows from an in-memory array.
   * Simulates the bun:sqlite adapter without requiring the actual runtime.
   */
  function mockOpenMessageDb(rows: Array<{ id: string; session_id: string; time_created: number; role?: string | null; data: string }>) {
    // Auto-populate role from data JSON if not explicitly provided
    const enrichedRows = rows.map((r) => ({
      ...r,
      role: r.role !== undefined ? r.role : (() => {
        try { return (JSON.parse(r.data) as Record<string, unknown>).role as string ?? null; } catch { return null; }
      })(),
    }));
    return (_dbPath: string) => ({
      queryMessages: (lastTimeCreated: number) =>
        enrichedRows.filter((r) => r.time_created >= lastTimeCreated),
      close: () => {},
    });
  }

  /** Helper: build a SQLite message row JSON data blob */
  function sqliteRowData(opts: {
    role: string;
    modelID?: string;
    input?: number;
    output?: number;
    timeCreated?: number;
    timeCompleted?: number;
  }): string {
    return JSON.stringify({
      role: opts.role,
      modelID: opts.modelID ?? "claude-sonnet-4-20250514",
      time: {
        created: opts.timeCreated ?? 1739600000000,
        completed: opts.timeCompleted ?? (opts.timeCreated ?? 1739600000000) + 5000,
      },
      tokens: opts.role === "assistant"
        ? { total: (opts.input ?? 100) + (opts.output ?? 50), input: opts.input ?? 100, output: opts.output ?? 50, reasoning: 0, cache: { read: 0, write: 0 } }
        : null,
    });
  }

  it("should sync OpenCode SQLite data to queue", async () => {
    const rows = [
      { id: "msg_001", session_id: "ses_001", time_created: 1739600000000, data: sqliteRowData({ role: "assistant", input: 5000, output: 800, timeCreated: 1739600000000 }) },
      { id: "msg_002", session_id: "ses_001", time_created: 1739600010000, data: sqliteRowData({ role: "user", timeCreated: 1739600010000 }) },
      { id: "msg_003", session_id: "ses_001", time_created: 1739600020000, data: sqliteRowData({ role: "assistant", input: 3000, output: 200, timeCreated: 1739600020000 }) },
    ];

    // Create a dummy DB file so stat() succeeds
    const dbDir = join(dataDir, "opencode");
    await mkdir(dbDir, { recursive: true });
    const dbPath = join(dbDir, "opencode.db");
    await writeFile(dbPath, "dummy");

    const result = await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: mockOpenMessageDb(rows),
    });

    // 2 assistant messages with tokens → 2 deltas
    expect(result.totalDeltas).toBe(2);
    expect(result.sources.opencode).toBe(2);
    expect(result.totalRecords).toBeGreaterThanOrEqual(1);
  });

  it("should be incremental for OpenCode SQLite (second sync with no new rows)", async () => {
    const rows = [
      { id: "msg_001", session_id: "ses_001", time_created: 1739600000000, data: sqliteRowData({ role: "assistant", input: 5000, output: 800, timeCreated: 1739600000000 }) },
    ];

    const dbDir = join(dataDir, "opencode");
    await mkdir(dbDir, { recursive: true });
    const dbPath = join(dbDir, "opencode.db");
    await writeFile(dbPath, "dummy");

    const r1 = await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: mockOpenMessageDb(rows),
    });
    expect(r1.totalDeltas).toBe(1);

    // Second sync: cursor has advanced, no new rows
    const r2 = await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: mockOpenMessageDb(rows),
    });
    expect(r2.totalDeltas).toBe(0);
    expect(r2.totalRecords).toBe(0);
  });

  it("should dedup SQLite rows against JSON messageKeys during overlap window", async () => {
    // Simulate overlap: same message exists in both JSON file and SQLite

    // Step 1: sync the JSON file first
    const ocDir = join(dataDir, "opencode", "message", "ses_001");
    await mkdir(ocDir, { recursive: true });
    await writeFile(
      join(ocDir, "msg_001.json"),
      opencodeMsg(1739600000000, 14967, 437),
    );

    const r1 = await executeSync({
      stateDir,
      openCodeMessageDir: join(dataDir, "opencode", "message"),
    });
    expect(r1.totalDeltas).toBe(1);
    expect(r1.sources.opencode).toBe(1);

    // Step 2: now sync with SQLite containing the SAME message + a new one
    const dbDir = join(dataDir, "opencode");
    const dbPath = join(dbDir, "opencode.db");
    await writeFile(dbPath, "dummy");

    const sqliteRows = [
      // Same message as JSON — should be deduped
      { id: "msg_001", session_id: "ses_001", time_created: 1739600000000, data: sqliteRowData({ role: "assistant", input: 14967, output: 437, timeCreated: 1739600000000 }) },
      // New message — should be included
      { id: "msg_002", session_id: "ses_001", time_created: 1739600020000, data: sqliteRowData({ role: "assistant", input: 3000, output: 200, timeCreated: 1739600020000 }) },
    ];

    const r2 = await executeSync({
      stateDir,
      openCodeMessageDir: join(dataDir, "opencode", "message"),
      openCodeDbPath: dbPath,
      openMessageDb: mockOpenMessageDb(sqliteRows),
    });

    // JSON file unchanged (triple-check skip) → 0 from JSON
    // SQLite: msg_001 deduped, msg_002 is new → 1 from SQLite
    expect(r2.sources.opencode).toBe(1);
    expect(r2.totalDeltas).toBe(1);
  });

  it("should gracefully skip when SQLite DB file does not exist", async () => {
    const result = await executeSync({
      stateDir,
      openCodeDbPath: "/nonexistent/opencode.db",
      openMessageDb: mockOpenMessageDb([]),
    });

    expect(result.totalDeltas).toBe(0);
    expect(result.sources.opencode).toBe(0);
  });

  it("should gracefully handle when openMessageDb returns null", async () => {
    const dbDir = join(dataDir, "opencode");
    await mkdir(dbDir, { recursive: true });
    const dbPath = join(dbDir, "opencode.db");
    await writeFile(dbPath, "dummy");

    const result = await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: () => null,
    });

    expect(result.totalDeltas).toBe(0);
    expect(result.sources.opencode).toBe(0);
  });

  it("should not lose same-millisecond rows at the cursor boundary", async () => {
    // Two assistant messages at the exact same time_created.
    // After first sync processes both, the cursor should track
    // their IDs so the second sync doesn't re-process them.
    const sameMs = 1739600000000;
    const rows = [
      { id: "msg_A", session_id: "ses_001", time_created: sameMs, data: sqliteRowData({ role: "assistant", input: 100, output: 50, timeCreated: sameMs }) },
      { id: "msg_B", session_id: "ses_001", time_created: sameMs, data: sqliteRowData({ role: "assistant", input: 200, output: 100, timeCreated: sameMs }) },
    ];

    const dbDir = join(dataDir, "opencode");
    await mkdir(dbDir, { recursive: true });
    const dbPath = join(dbDir, "opencode.db");
    await writeFile(dbPath, "dummy");

    // First sync: both rows are new → 2 deltas
    const r1 = await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: mockOpenMessageDb(rows),
    });
    expect(r1.totalDeltas).toBe(2);
    expect(r1.sources.opencode).toBe(2);

    // Second sync: cursor's lastTimeCreated == sameMs, lastProcessedIds == [msg_A, msg_B]
    // The >= query returns both rows again, but they're filtered out by prevProcessedIds
    const r2 = await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: mockOpenMessageDb(rows),
    });
    expect(r2.totalDeltas).toBe(0);
    expect(r2.totalRecords).toBe(0);
  });

  it("should process a new row at the same millisecond as the cursor boundary", async () => {
    const sameMs = 1739600000000;
    const rowsBatch1 = [
      { id: "msg_A", session_id: "ses_001", time_created: sameMs, data: sqliteRowData({ role: "assistant", input: 100, output: 50, timeCreated: sameMs }) },
    ];

    const dbDir = join(dataDir, "opencode");
    await mkdir(dbDir, { recursive: true });
    const dbPath = join(dbDir, "opencode.db");
    await writeFile(dbPath, "dummy");

    // First sync: msg_A processed
    const r1 = await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: mockOpenMessageDb(rowsBatch1),
    });
    expect(r1.totalDeltas).toBe(1);

    // A new row arrives at the same millisecond (rare but possible)
    const rowsBatch2 = [
      ...rowsBatch1,
      { id: "msg_B", session_id: "ses_001", time_created: sameMs, data: sqliteRowData({ role: "assistant", input: 200, output: 100, timeCreated: sameMs }) },
    ];

    // Second sync: msg_A deduped, msg_B is new → 1 delta
    const r2 = await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: mockOpenMessageDb(rowsBatch2),
    });
    expect(r2.totalDeltas).toBe(1);
    expect(r2.sources.opencode).toBe(1);
  });

  it("should emit warning when DB exists but openMessageDb adapter is missing", async () => {
    const dbDir = join(dataDir, "opencode");
    await mkdir(dbDir, { recursive: true });
    const dbPath = join(dbDir, "opencode.db");
    await writeFile(dbPath, "dummy");

    const events: Array<{ source: string; phase: string; message?: string }> = [];

    await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      // openMessageDb intentionally NOT provided
      onProgress: (e) => events.push({ source: e.source, phase: e.phase, message: e.message }),
    });

    const warnEvent = events.find(
      (e) => e.source === "opencode-sqlite" && e.phase === "warn",
    );
    expect(warnEvent).toBeDefined();
    expect(warnEvent!.message).toContain("SQLite is not available");
  });

  it("should emit warning when openMessageDb returns null (DB can't be opened)", async () => {
    const dbDir = join(dataDir, "opencode");
    await mkdir(dbDir, { recursive: true });
    const dbPath = join(dbDir, "opencode.db");
    await writeFile(dbPath, "dummy");

    const events: Array<{ source: string; phase: string; message?: string }> = [];

    await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: () => null,
      onProgress: (e) => events.push({ source: e.source, phase: e.phase, message: e.message }),
    });

    const warnEvent = events.find(
      (e) => e.source === "opencode-sqlite" && e.phase === "warn",
    );
    expect(warnEvent).toBeDefined();
    expect(warnEvent!.message).toContain("Failed to open");
  });

  // ===== OpenClaw parse error branch (lines 446-454) =====

  it("should emit warning and continue when OpenClaw parser throws", async () => {
    // Good OpenClaw file
    const goodDir = join(dataDir, ".openclaw", "agents", "a1", "sessions");
    await mkdir(goodDir, { recursive: true });
    await writeFile(
      join(goodDir, "session-good.jsonl"),
      openclawLine("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    // Bad OpenClaw file
    const badDir = join(dataDir, ".openclaw", "agents", "a2", "sessions");
    await mkdir(badDir, { recursive: true });
    await writeFile(
      join(badDir, "session-bad.jsonl"),
      openclawLine("2026-03-07T10:15:00.000Z", 3000, 400) + "\n",
    );

    // Spy on the parser to throw for the bad file
    const openclawParser = await import("../parsers/openclaw.js");
    const origParse = openclawParser.parseOpenClawFile;
    const spy = vi
      .spyOn(openclawParser, "parseOpenClawFile")
      .mockImplementation(async (opts) => {
        if (opts.filePath.includes("session-bad")) {
          throw new Error("Simulated openclaw parser crash");
        }
        return origParse(opts);
      });

    const events: Array<{ source: string; phase: string; message?: string }> = [];

    try {
      const result = await executeSync({
        stateDir,
        openclawDir: join(dataDir, ".openclaw"),
        onProgress: (e) =>
          events.push({ source: e.source, phase: e.phase, message: e.message }),
      });

      // Good file data should still be synced
      expect(result.sources.openclaw).toBe(1);

      // Verify a warning was emitted for the bad file
      const warnEvents = events.filter(
        (e) => e.source === "openclaw" && e.phase === "warn",
      );
      expect(warnEvents).toHaveLength(1);
      expect(warnEvents[0].message).toContain("Simulated openclaw parser crash");
    } finally {
      spy.mockRestore();
    }
  });

  // ===== Codex parse error branch (lines 510-517) =====

  it("should emit warning and continue when Codex parser throws", async () => {
    // Good Codex file
    const goodDir = join(dataDir, ".codex", "sessions", "2026", "03", "07");
    await mkdir(goodDir, { recursive: true });
    await writeFile(
      join(goodDir, "rollout-good.jsonl"),
      codexLines("2026-03-07T10:15:00.000Z", 5000, 800) + "\n",
    );

    // Bad Codex file
    await writeFile(
      join(goodDir, "rollout-bad.jsonl"),
      codexLines("2026-03-07T10:16:00.000Z", 3000, 400) + "\n",
    );

    // Spy on the parser to throw for the bad file
    const codexParser = await import("../parsers/codex.js");
    const origParse = codexParser.parseCodexFile;
    const spy = vi
      .spyOn(codexParser, "parseCodexFile")
      .mockImplementation(async (opts) => {
        if (opts.filePath.includes("rollout-bad")) {
          throw new Error("Simulated codex parser crash");
        }
        return origParse(opts);
      });

    const events: Array<{ source: string; phase: string; message?: string }> = [];

    try {
      const result = await executeSync({
        stateDir,
        codexSessionsDir: join(dataDir, ".codex", "sessions"),
        onProgress: (e) =>
          events.push({ source: e.source, phase: e.phase, message: e.message }),
      });

      // Good file data should still be synced
      expect(result.sources.codex).toBe(1);

      // Verify a warning was emitted for the bad file
      const warnEvents = events.filter(
        (e) => e.source === "codex" && e.phase === "warn",
      );
      expect(warnEvents).toHaveLength(1);
      expect(warnEvents[0].message).toContain("Simulated codex parser crash");
    } finally {
      spy.mockRestore();
    }
  });

  // ===== Gemini parse error branch with onProgress (lines 198-203) =====

  it("should emit warning and continue when Gemini parser throws", async () => {
    const geminiDir = join(dataDir, ".gemini", "tmp", "proj-gem-err", "chats");
    await mkdir(geminiDir, { recursive: true });

    // Good file
    await writeFile(
      join(geminiDir, "session-good.json"),
      geminiSession("2026-03-07T11:00:00.000Z", 2000, 200),
    );

    // Bad file — will be forced to throw via spy
    await writeFile(
      join(geminiDir, "session-bad.json"),
      geminiSession("2026-03-07T12:00:00.000Z", 3000, 300),
    );

    const geminiParser = await import("../parsers/gemini.js");
    const origParse = geminiParser.parseGeminiFile;
    const spy = vi
      .spyOn(geminiParser, "parseGeminiFile")
      .mockImplementation(async (opts) => {
        if (opts.filePath.includes("session-bad")) {
          throw new Error("Simulated gemini parser crash");
        }
        return origParse(opts);
      });

    const events: Array<{ source: string; phase: string; message?: string }> = [];

    try {
      const result = await executeSync({
        stateDir,
        geminiDir: join(dataDir, ".gemini"),
        onProgress: (e) =>
          events.push({ source: e.source, phase: e.phase, message: e.message }),
      });

      // Good file data should still be synced
      expect(result.sources.gemini).toBe(1);

      // Verify a warning was emitted for the bad file
      const warnEvents = events.filter(
        (e) => e.source === "gemini-cli" && e.phase === "warn",
      );
      expect(warnEvents).toHaveLength(1);
      expect(warnEvents[0].message).toContain("Simulated gemini parser crash");
    } finally {
      spy.mockRestore();
    }
  });

  // ===== OpenCode parse error branch with onProgress (lines 277-283) =====

  it("should emit warning and continue when OpenCode parser throws", async () => {
    const msgDir = join(dataDir, "opencode-err", "message");

    // Good file in a session dir
    const sesDir1 = join(msgDir, "ses_good");
    await mkdir(sesDir1, { recursive: true });
    await writeFile(join(sesDir1, "msg_001.json"), opencodeMsg(1741320000000, 100, 50));

    // Bad file in another session dir — will be forced to throw via spy
    const sesDir2 = join(msgDir, "ses_bad");
    await mkdir(sesDir2, { recursive: true });
    await writeFile(join(sesDir2, "msg_001.json"), opencodeMsg(1741321000000, 200, 100));

    const ocParser = await import("../parsers/opencode.js");
    const origParse = ocParser.parseOpenCodeFile;
    const spy = vi
      .spyOn(ocParser, "parseOpenCodeFile")
      .mockImplementation(async (opts) => {
        if (opts.filePath.includes("ses_bad")) {
          throw new Error("Simulated opencode parser crash");
        }
        return origParse(opts);
      });

    const events: Array<{ source: string; phase: string; message?: string }> = [];

    try {
      const result = await executeSync({
        stateDir,
        openCodeMessageDir: msgDir,
        onProgress: (e) =>
          events.push({ source: e.source, phase: e.phase, message: e.message }),
      });

      // Good file data should still be synced
      expect(result.sources.opencode).toBeGreaterThanOrEqual(1);

      // Verify a warning was emitted for the bad file
      const warnEvents = events.filter(
        (e) => e.source === "opencode" && e.phase === "warn",
      );
      expect(warnEvents).toHaveLength(1);
      expect(warnEvents[0].message).toContain("Simulated opencode parser crash");
    } finally {
      spy.mockRestore();
    }
  });

  // ===== OpenCode file-level skip with onProgress (lines 264-268) =====

  it("should emit parse progress for OpenCode file-level skip on unchanged file", async () => {
    const msgDir = join(dataDir, "opencode-fskip", "message");
    const sesDir = join(msgDir, "ses_fskip");
    await mkdir(sesDir, { recursive: true });
    await writeFile(join(sesDir, "msg_001.json"), opencodeMsg(1741320000000, 100, 50));

    // First sync without onProgress to establish cursors
    await executeSync({
      stateDir,
      openCodeMessageDir: msgDir,
    });

    // Add a new file to the session dir to change dir mtime (but keep msg_001 unchanged)
    await new Promise((r) => setTimeout(r, 50));
    await writeFile(join(sesDir, "msg_002.json"), opencodeMsg(1741320300000, 150, 75));

    // Second sync with onProgress — dir mtime changed, so dir is scanned.
    // msg_001 has same inode+mtime+size → file-level skip path fires.
    const events: Array<{ source: string; phase: string; current?: number; total?: number }> = [];
    const result = await executeSync({
      stateDir,
      openCodeMessageDir: msgDir,
      onProgress: (e) => events.push({
        source: e.source,
        phase: e.phase,
        current: e.current,
        total: e.total,
      }),
    });

    // msg_002 is new, so at least 1 delta from it
    expect(result.sources.opencode).toBeGreaterThanOrEqual(1);

    // Verify parse progress events were fired (both for skipped and parsed files)
    const parseEvents = events.filter(
      (e) => e.source === "opencode" && e.phase === "parse" && e.current !== undefined,
    );
    expect(parseEvents.length).toBeGreaterThanOrEqual(2); // at least 2 files
  });

  // ===== OpenCode SQLite onProgress for parse detail (lines 381-384) =====

  it("should emit parse progress for OpenCode SQLite data with onProgress", async () => {
    const dbDir = join(dataDir, "opencode-sqlprog");
    await mkdir(dbDir, { recursive: true });
    const dbPath = join(dbDir, "opencode.db");
    await writeFile(dbPath, "dummy");

    const events: Array<{ source: string; phase: string; message?: string }> = [];

    await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: (_p: string) => ({
        queryMessages: (_lastTs: number) => [
          {
            id: "msg_sql_001",
            session_id: "ses_sql_001",
            role: "assistant",
            time_created: 1741320000000,
            data: JSON.stringify({
              role: "assistant",
              modelID: "claude-opus-4.6",
              time: { created: 1741320000000, completed: 1741320001000 },
              tokens: { total: 150, input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
            }),
          },
        ],
        close: () => {},
      }),
      onProgress: (e) => events.push({ source: e.source, phase: e.phase, message: e.message }),
    });

    // Verify SQLite discover event
    const discoverEvents = events.filter(
      (e) => e.source === "opencode-sqlite" && e.phase === "discover",
    );
    expect(discoverEvents).toHaveLength(1);

    // Verify SQLite parse progress event with delta details
    const parseEvents = events.filter(
      (e) => e.source === "opencode-sqlite" && e.phase === "parse",
    );
    expect(parseEvents).toHaveLength(1);
    expect(parseEvents[0].message).toContain("Parsed");
    expect(parseEvents[0].message).toContain("deltas");
  });

  // ===== OpenCode SQLite with no rows at all (line 395: rawRows empty fallback) =====

  it("should handle empty SQLite queryMessages result gracefully", async () => {
    const dbDir = join(dataDir, "opencode-sqlempty");
    await mkdir(dbDir, { recursive: true });
    const dbPath = join(dbDir, "opencode.db");
    await writeFile(dbPath, "dummy");

    const result = await executeSync({
      stateDir,
      openCodeDbPath: dbPath,
      openMessageDb: (_p: string) => ({
        queryMessages: (_lastTs: number) => [],
        close: () => {},
      }),
    });

    expect(result.totalDeltas).toBe(0);
    expect(result.sources.opencode).toBe(0);
  });
});
