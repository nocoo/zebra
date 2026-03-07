/**
 * Core type definitions for the Zebra token usage tracking system.
 *
 * Architecture:
 *   CLI (Parsers) → UsageRecord → HourBucket → Upload to SaaS
 *   SaaS (API)    → Store in D1  → Dashboard / Leaderboard
 */

// ---------------------------------------------------------------------------
// Source: Supported AI coding tools
// ---------------------------------------------------------------------------

/** The 4 supported AI coding tools */
export type Source =
  | "claude-code"
  | "gemini-cli"
  | "opencode"
  | "openclaw";

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

/** Token count breakdown for a single interaction */
export interface TokenDelta {
  /** Total input tokens consumed */
  inputTokens: number;
  /** Input tokens served from cache (subset of inputTokens) */
  cachedInputTokens: number;
  /** Total output tokens generated */
  outputTokens: number;
  /** Output tokens used for reasoning/thinking (subset of outputTokens) */
  reasoningOutputTokens: number;
}

// ---------------------------------------------------------------------------
// Usage record
// ---------------------------------------------------------------------------

/**
 * A single normalized usage record.
 *
 * Represents token consumption from one AI tool + model combo
 * within a specific hour bucket.
 */
export interface UsageRecord {
  /** Which AI tool produced this usage */
  source: Source;
  /** Model identifier (e.g. "claude-sonnet-4-20250514", "o3", "gemini-2.5-pro") */
  model: string;
  /** ISO 8601 hour boundary (e.g. "2026-03-07T10:00:00Z") */
  hourStart: string;
  /** Token count breakdown */
  tokens: TokenDelta;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** A collection of usage records within the same hour */
export interface HourBucket {
  /** ISO 8601 hour boundary */
  hourStart: string;
  /** All records aggregated into this bucket */
  records: UsageRecord[];
}

// ---------------------------------------------------------------------------
// Sync cursor (incremental parsing)
// ---------------------------------------------------------------------------

/** Base fields shared by all per-file cursors */
export interface FileCursorBase {
  /** File inode for detecting file rotation/replacement */
  inode: number;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

/** Cursor for byte-offset-based JSONL files (Claude, Codex, OpenClaw) */
export interface ByteOffsetCursor extends FileCursorBase {
  /** Byte offset where we last stopped reading */
  offset: number;
}

/** Cursor for Gemini (array-index-based JSON files) */
export interface GeminiCursor extends FileCursorBase {
  /** Index of last processed message in the messages array */
  lastIndex: number;
  /** Last seen cumulative token totals (for diff computation) */
  lastTotals: TokenDelta | null;
  /** Last seen model identifier */
  lastModel: string | null;
}

/** Cursor for OpenCode (individual message files with change detection) */
export interface OpenCodeCursor extends FileCursorBase {
  /** File size in bytes (for unchanged detection) */
  size: number;
  /** File mtime in ms (for unchanged detection) */
  mtimeMs: number;
  /** Last seen cumulative token totals (for diff computation) */
  lastTotals: TokenDelta | null;
  /** Composite key "sessionId|messageId" */
  messageKey: string | null;
}

/** Union of all cursor types, keyed by absolute file path */
export type FileCursor = ByteOffsetCursor | GeminiCursor | OpenCodeCursor;

/** Top-level cursor store persisted to disk */
export interface CursorState {
  version: 1;
  /** Per-file cursors, keyed by absolute file path */
  files: Record<string, FileCursor>;
  /** ISO 8601 timestamp of last cursor update */
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Queue record (JSONL format for local queue)
// ---------------------------------------------------------------------------

/** A single row in the local queue.jsonl file */
export interface QueueRecord {
  source: Source;
  model: string;
  /** ISO 8601 half-hour boundary (e.g. "2026-03-07T10:30:00.000Z") */
  hour_start: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
}

// ---------------------------------------------------------------------------
// CLI Config
// ---------------------------------------------------------------------------

/** Persisted CLI configuration (stored at ~/.config/zebra/config.json) */
export interface ZebraConfig {
  /** Auth token obtained via `zebra login` */
  token?: string;
}
