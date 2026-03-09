import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NotifierPaths } from "../notifier/paths.js";
import {
  getAllDrivers,
  getDriver,
  installAll,
  statusAll,
  uninstallAll,
} from "../notifier/registry.js";

describe("notifier registry", () => {
  let tempDir: string;
  let paths: NotifierPaths;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pew-registry-"));
    paths = {
      stateDir: join(tempDir, "state"),
      binDir: join(tempDir, "state", "bin"),
      notifyPath: join(tempDir, "state", "bin", "notify.cjs"),
      lockPath: join(tempDir, "state", "sync.lock"),
      signalPath: join(tempDir, "state", "notify.signal"),
      claudeDir: join(tempDir, ".claude"),
      claudeSettingsPath: join(tempDir, ".claude", "settings.json"),
      geminiDir: join(tempDir, ".gemini"),
      geminiSettingsPath: join(tempDir, ".gemini", "settings.json"),
      opencodeConfigDir: join(tempDir, ".config", "opencode"),
      opencodePluginDir: join(tempDir, ".config", "opencode", "plugin"),
      openclawHome: join(tempDir, ".openclaw"),
      openclawConfigPath: join(tempDir, ".openclaw", "openclaw.json"),
      openclawPluginDir: join(tempDir, "state", "openclaw-plugin"),
      codexHome: join(tempDir, ".codex"),
      codexConfigPath: join(tempDir, ".codex", "config.toml"),
      codexNotifyOriginalPath: join(tempDir, "state", "codex_notify_original.json"),
    };

    await mkdir(paths.codexHome, { recursive: true });
    await writeFile(paths.codexConfigPath, 'model = "gpt-5"\n', "utf8");
    await mkdir(paths.openclawHome, { recursive: true });
    await writeFile(paths.openclawConfigPath, "{}\n", "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("registers all 5 drivers", () => {
    const drivers = getAllDrivers();
    expect(drivers).toHaveLength(5);
    expect(drivers.map((driver) => driver.source)).toEqual([
      "claude-code",
      "gemini-cli",
      "opencode",
      "openclaw",
      "codex",
    ]);
  });

  it("returns a driver by source", () => {
    expect(getDriver("codex")?.displayName).toBe("Codex");
    expect(getDriver("claude-code")?.displayName).toBe("Claude Code");
  });

  it("installs and uninstalls all drivers without stopping on openclaw CLI skip", async () => {
    const spawn = vi.fn(() => {
      const err = new Error("missing") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    const installed = await installAll(paths, { spawn });
    const uninstalled = await uninstallAll(paths, { spawn });

    expect(installed).toHaveLength(5);
    expect(installed.find((item) => item.source === "openclaw")?.action).toBe("skip");
    expect(installed.find((item) => item.source === "codex")?.changed).toBe(true);
    expect(uninstalled).toHaveLength(5);
  });

  it("reports status for all sources", async () => {
    const statuses = await statusAll(paths);

    expect(Object.keys(statuses)).toHaveLength(5);
    expect(statuses.codex).toBe("not-installed");
    expect(statuses["claude-code"]).toBe("not-installed");
  });
});
