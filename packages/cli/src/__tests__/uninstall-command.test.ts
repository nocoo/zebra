import { describe, expect, it, vi } from "vitest";
import type { NotifierOperationResult, Source } from "@pew/core";
import { executeUninstall } from "../commands/uninstall.js";
import type { NotifierPaths } from "../notifier/paths.js";

function createPaths(): NotifierPaths {
  return {
    stateDir: "/tmp/pew",
    binDir: "/tmp/pew/bin",
    notifyPath: "/tmp/pew/bin/notify.cjs",
    lockPath: "/tmp/pew/sync.lock",
    signalPath: "/tmp/pew/notify.signal",
    claudeDir: "/tmp/.claude",
    claudeSettingsPath: "/tmp/.claude/settings.json",
    geminiDir: "/tmp/.gemini",
    geminiSettingsPath: "/tmp/.gemini/settings.json",
    opencodeConfigDir: "/tmp/.config/opencode",
    opencodePluginDir: "/tmp/.config/opencode/plugin",
    openclawHome: "/tmp/.openclaw",
    openclawConfigPath: "/tmp/.openclaw/openclaw.json",
    openclawPluginDir: "/tmp/pew/openclaw-plugin",
    codexHome: "/tmp/.codex",
    codexConfigPath: "/tmp/.codex/config.toml",
    codexNotifyOriginalPath: "/tmp/pew/codex_notify_original.json",
  };
}

describe("executeUninstall", () => {
  it("uninstalls all drivers and removes shared notifier artifacts", async () => {
    const hooks: NotifierOperationResult[] = [
      {
        source: "claude-code",
        action: "uninstall",
        changed: true,
        detail: "ok",
      },
      {
        source: "codex",
        action: "uninstall",
        changed: true,
        detail: "ok",
      },
    ];
    const removeNotifyHandlerFn = vi.fn(async () => ({
      changed: true,
      path: "/tmp/pew/bin/notify.cjs",
      detail: "notify.cjs removed",
    }));
    const removeCodexBackupFn = vi.fn(async () => ({
      changed: true,
      path: "/tmp/pew/codex_notify_original.json",
      detail: "Codex backup removed",
    }));

    const result = await executeUninstall({
      stateDir: "/tmp/pew",
      home: "/tmp",
      resolveNotifierPathsFn: createPaths,
      uninstallAllFn: vi.fn(async () => hooks),
      removeNotifyHandlerFn,
      removeCodexBackupFn,
    });

    expect(result.hooks).toEqual(hooks);
    expect(removeNotifyHandlerFn).toHaveBeenCalled();
    expect(removeCodexBackupFn).toHaveBeenCalled();
    expect(result.notifyHandler.changed).toBe(true);
    expect(result.codexBackup.changed).toBe(true);
  });

  it("does not write files during dry-run", async () => {
    const uninstallAllFn = vi.fn();
    const uninstallDriverFn = vi.fn();
    const removeNotifyHandlerFn = vi.fn();
    const removeCodexBackupFn = vi.fn();

    const result = await executeUninstall({
      stateDir: "/tmp/pew",
      home: "/tmp",
      dryRun: true,
      resolveNotifierPathsFn: createPaths,
      getAllDriversFn: () => [
        { source: "claude-code", displayName: "Claude Code" },
        { source: "codex", displayName: "Codex" },
      ] as Array<{ source: Source; displayName: string }>,
      uninstallAllFn,
      uninstallDriverFn,
      removeNotifyHandlerFn,
      removeCodexBackupFn,
    });

    expect(uninstallAllFn).not.toHaveBeenCalled();
    expect(uninstallDriverFn).not.toHaveBeenCalled();
    expect(removeNotifyHandlerFn).not.toHaveBeenCalled();
    expect(removeCodexBackupFn).not.toHaveBeenCalled();
    expect(result.hooks).toHaveLength(2);
    expect(result.hooks.every((hook) => hook.detail === "dry-run")).toBe(true);
  });

  it("filters uninstall to selected sources and keeps shared notify.cjs", async () => {
    const uninstallDriverFn = vi.fn(async (_source: Source) => ({
      source: "codex" as Source,
      action: "uninstall" as const,
      changed: true,
      detail: "ok",
    }));
    const removeNotifyHandlerFn = vi.fn();
    const removeCodexBackupFn = vi.fn(async () => ({
      changed: true,
      path: "/tmp/pew/codex_notify_original.json",
      detail: "Codex backup removed",
    }));

    const result = await executeUninstall({
      stateDir: "/tmp/pew",
      home: "/tmp",
      sources: ["codex"],
      resolveNotifierPathsFn: createPaths,
      uninstallDriverFn,
      removeNotifyHandlerFn,
      removeCodexBackupFn,
    });

    expect(uninstallDriverFn).toHaveBeenCalledTimes(1);
    expect(removeNotifyHandlerFn).not.toHaveBeenCalled();
    expect(removeCodexBackupFn).toHaveBeenCalledTimes(1);
    expect(result.hooks).toHaveLength(1);
  });

  it("continues filtering uninstalls when one selected source throws", async () => {
    const uninstallDriverFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        source: "gemini-cli",
        action: "uninstall",
        changed: true,
        detail: "ok",
      });

    const result = await executeUninstall({
      stateDir: "/tmp/pew",
      home: "/tmp",
      sources: ["codex", "gemini-cli"],
      resolveNotifierPathsFn: createPaths,
      uninstallDriverFn,
      removeNotifyHandlerFn: vi.fn(),
      removeCodexBackupFn: vi.fn(async () => ({
        changed: true,
        path: "/tmp/pew/codex_notify_original.json",
        detail: "Codex backup removed",
      })),
    });

    expect(result.hooks).toHaveLength(2);
    expect(result.hooks[0]?.action).toBe("skip");
    expect(result.hooks[1]?.source).toBe("gemini-cli");
  });

  it("returns skip for an unknown source when using the built-in driver lookup", async () => {
    const result = await executeUninstall({
      stateDir: "/tmp/pew",
      home: "/tmp",
      sources: ["unknown-source" as Source],
      resolveNotifierPathsFn: createPaths,
      removeNotifyHandlerFn: vi.fn(),
      removeCodexBackupFn: vi.fn(),
    });

    expect(result.hooks).toEqual([
      {
        source: "unknown-source",
        action: "skip",
        changed: false,
        detail: "Unknown source",
      },
    ]);
  });
});
