/**
 * Pi file session driver.
 *
 * Strategy: Full-scan on change (mtime + size dual-check).
 * Parser: collectPiSessions(filePath)
 */

import type { SessionFileCursor } from "@pew/core";
import { discoverPiFiles } from "../../discovery/sources.js";
import { collectPiSessions } from "../../parsers/pi-session.js";
import type { FileSessionDriver, DiscoverOpts, FileFingerprint } from "../types.js";

export const piSessionDriver: FileSessionDriver<SessionFileCursor> = {
  kind: "file",
  source: "pi",

  async discover(opts: DiscoverOpts): Promise<string[]> {
    if (!opts.piSessionsDir) return [];
    return discoverPiFiles(opts.piSessionsDir);
  },

  shouldSkip(cursor: SessionFileCursor | undefined, fingerprint: FileFingerprint): boolean {
    if (!cursor) return false;
    return cursor.mtimeMs === fingerprint.mtimeMs && cursor.size === fingerprint.size;
  },

  async parse(filePath: string) {
    return collectPiSessions(filePath);
  },

  buildCursor(fingerprint: FileFingerprint): SessionFileCursor {
    return { mtimeMs: fingerprint.mtimeMs, size: fingerprint.size };
  },
};
