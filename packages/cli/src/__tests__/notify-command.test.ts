import { describe, expect, it, vi } from "vitest";
import type { CoordinatorRunResult, SyncTrigger } from "@pew/core";
import { executeNotify } from "../commands/notify.js";

describe("executeNotify", () => {
  it("passes a notify trigger into coordinatedSync", async () => {
    const coordinatedSyncFn = vi.fn<
      (
        trigger: SyncTrigger,
        opts: { executeSyncFn: (triggers: SyncTrigger[]) => Promise<void>; stateDir: string },
      ) => Promise<CoordinatorRunResult>
    >(async (trigger) => ({
      runId: "run-1",
      triggers: [trigger],
      hadFollowUp: false,
      waitedForLock: false,
      skippedSync: false,
    }));

    const result = await executeNotify({
      source: "codex",
      fileHint: "/tmp/rollout.jsonl",
      stateDir: "/tmp/pew",
      coordinatedSyncFn,
      executeSyncFn: vi.fn(async () => {}),
    });

    expect(coordinatedSyncFn).toHaveBeenCalledTimes(1);
    expect(coordinatedSyncFn.mock.calls[0]?.[0]).toEqual({
      kind: "notify",
      source: "codex",
      fileHint: "/tmp/rollout.jsonl",
    });
    expect(result.runId).toBe("run-1");
  });

  it("delegates to executeSync through the coordinated executor", async () => {
    const executeSyncFn = vi.fn(async (_triggers: SyncTrigger[]) => {});

    await executeNotify({
      source: "claude-code",
      stateDir: "/tmp/pew",
      executeSyncFn,
      coordinatedSyncFn: async (trigger, opts) => {
        await opts.executeSyncFn([trigger]);
        return {
          runId: "run-2",
          triggers: [trigger],
          hadFollowUp: false,
          waitedForLock: false,
          skippedSync: false,
        };
      },
    });

    expect(executeSyncFn).toHaveBeenCalledWith([
      { kind: "notify", source: "claude-code", fileHint: null },
    ]);
  });

  it("returns coordinator errors", async () => {
    const result = await executeNotify({
      source: "gemini-cli",
      stateDir: "/tmp/pew",
      executeSyncFn: vi.fn(async () => {}),
      coordinatedSyncFn: async (trigger) => ({
        runId: "run-3",
        triggers: [trigger],
        hadFollowUp: false,
        waitedForLock: true,
        skippedSync: true,
        error: "lock timeout",
      }),
    });

    expect(result.error).toBe("lock timeout");
    expect(result.skippedSync).toBe(true);
  });
});
