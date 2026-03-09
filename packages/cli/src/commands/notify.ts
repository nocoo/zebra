import type { CoordinatorRunResult, Source, SyncTrigger } from "@pew/core";
import { executeSync, type SyncOptions } from "./sync.js";
import {
  coordinatedSync,
  type CoordinatorOptions,
} from "../notifier/coordinator.js";

export interface NotifyOptions extends SyncOptions {
  source: Source;
  fileHint?: string | null;
  coordinatedSyncFn?: typeof coordinatedSync;
  executeSyncFn?: (triggers: SyncTrigger[]) => Promise<void>;
}

export async function executeNotify(
  opts: NotifyOptions,
): Promise<CoordinatorRunResult> {
  const coordinatedSyncFn = opts.coordinatedSyncFn ?? coordinatedSync;
  const executeSyncFn =
    opts.executeSyncFn ??
    (async () => {
      await executeSync({
        stateDir: opts.stateDir,
        claudeDir: opts.claudeDir,
        codexSessionsDir: opts.codexSessionsDir,
        geminiDir: opts.geminiDir,
        openCodeMessageDir: opts.openCodeMessageDir,
        openCodeDbPath: opts.openCodeDbPath,
        openMessageDb: opts.openMessageDb,
        openclawDir: opts.openclawDir,
      });
    });

  const coordinatorOptions: CoordinatorOptions = {
    stateDir: opts.stateDir,
    executeSyncFn,
  };

  return coordinatedSyncFn(
    {
      kind: "notify",
      source: opts.source,
      fileHint: opts.fileHint ?? null,
    },
    coordinatorOptions,
  );
}
