/**
 * Gemini CLI session collector.
 *
 * Reads a Gemini session JSON file and extracts session-level metadata.
 * Each file contains one session with a messages[] array.
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { SessionSnapshot, Source } from "@pew/core";

/**
 * Collect session snapshots from a Gemini CLI session JSON file.
 *
 * Gemini stores one JSON file per session with:
 * - sessionId (optional)
 * - projectHash (optional)
 * - messages[]: { type, timestamp, model? }
 *
 * Returns an array of 0 or 1 SessionSnapshot.
 */
export async function collectGeminiSessions(
  filePath: string,
): Promise<SessionSnapshot[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [];
  }

  if (!raw.trim()) return [];

  let session: Record<string, unknown>;
  try {
    session = JSON.parse(raw);
  } catch {
    return [];
  }

  const messages = Array.isArray(session?.messages)
    ? (session.messages as Record<string, unknown>[])
    : [];

  if (messages.length === 0) return [];

  // Derive session key
  const sessionId =
    typeof session.sessionId === "string" ? session.sessionId : null;
  const sessionKey = sessionId
    ? `gemini:${sessionId}`
    : `gemini:${createHash("sha256").update(resolve(filePath)).digest("hex").slice(0, 16)}`;

  // Extract projectRef
  const projectRef =
    typeof session.projectHash === "string" ? session.projectHash : null;

  // Count messages and track timestamps/model
  let userMessages = 0;
  let assistantMessages = 0;
  let totalMessages = 0;
  let minTimestamp: string | null = null;
  let maxTimestamp: string | null = null;
  let lastModel: string | null = null;

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;

    totalMessages++;

    const type = typeof msg.type === "string" ? msg.type : null;
    if (type === "user") {
      userMessages++;
    } else if (type === "gemini") {
      assistantMessages++;
    }

    const timestamp =
      typeof msg.timestamp === "string" ? msg.timestamp : null;
    if (timestamp) {
      if (!minTimestamp || timestamp < minTimestamp) {
        minTimestamp = timestamp;
      }
      if (!maxTimestamp || timestamp > maxTimestamp) {
        maxTimestamp = timestamp;
      }
    }

    const model = typeof msg.model === "string" ? msg.model.trim() : null;
    if (model) {
      lastModel = model;
    }
  }

  if (!minTimestamp) return [];

  const startedAt = minTimestamp;
  const lastMessageAt = maxTimestamp ?? minTimestamp;
  const durationMs =
    new Date(lastMessageAt).getTime() - new Date(startedAt).getTime();

  return [
    {
      sessionKey,
      source: "gemini-cli" as Source,
      kind: "human",
      startedAt,
      lastMessageAt,
      durationSeconds: Math.max(0, Math.floor(durationMs / 1000)),
      userMessages,
      assistantMessages,
      totalMessages,
      projectRef,
      model: lastModel,
      snapshotAt: new Date().toISOString(),
    },
  ];
}
