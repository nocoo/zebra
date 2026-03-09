import { stat } from "node:fs/promises";
import { CursorStore } from "../storage/cursor-store.js";
import { LocalQueue } from "../storage/local-queue.js";
import type { CursorState, QueueRecord } from "@pew/core";

/** Status summary for display */
export interface StatusResult {
  /** Number of tracked files */
  trackedFiles: number;
  /** Last sync timestamp (ISO) or null */
  lastSync: string | null;
  /** Number of unuploaded records in queue */
  pendingRecords: number;
  /** Breakdown by source */
  sources: Record<string, number>;
}

/**
 * Compute the current sync status.
 * Pure logic — no CLI I/O.
 */
export async function executeStatus(opts: {
  stateDir: string;
}): Promise<StatusResult> {
  const { stateDir } = opts;

  const cursorStore = new CursorStore(stateDir);
  const queue = new LocalQueue(stateDir);

  const cursors = await cursorStore.load();
  const offset = await queue.loadOffset();
  const { records } = await queue.readFromOffset(offset);

  // Count files by source based on path patterns
  const sources: Record<string, number> = {};
  for (const filePath of Object.keys(cursors.files)) {
    let source = "unknown";
    if (filePath.includes(".claude")) source = "claude-code";
    else if (filePath.includes(".codex")) source = "codex";
    else if (filePath.includes(".gemini")) source = "gemini-cli";
    else if (filePath.includes("opencode")) source = "opencode";
    else if (filePath.includes(".openclaw")) source = "openclaw";

    sources[source] = (sources[source] || 0) + 1;
  }

  return {
    trackedFiles: Object.keys(cursors.files).length,
    lastSync: cursors.updatedAt,
    pendingRecords: records.length,
    sources,
  };
}
