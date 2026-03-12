import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import type { PewConfig } from "@pew/core";

const PROD_CONFIG = "config.json";
const DEV_CONFIG = "config.dev.json";
const DEVICE_FILE = "device.json";

/**
 * Manages the CLI configuration file.
 * Stored at ~/.config/pew/config.json (prod) or config.dev.json (dev).
 */
export class ConfigManager {
  readonly configPath: string;
  readonly configDir: string;

  constructor(configDir: string, dev = false) {
    this.configDir = configDir;
    const filename = dev ? DEV_CONFIG : PROD_CONFIG;
    this.configPath = join(configDir, filename);
  }

  /** Load config from disk. Returns empty config if file doesn't exist or is corrupted. */
  async load(): Promise<PewConfig> {
    try {
      const raw = await readFile(this.configPath, "utf-8");
      return JSON.parse(raw) as PewConfig;
    } catch {
      return {};
    }
  }

  /** Save config to disk, creating the directory if needed. */
  async save(config: PewConfig): Promise<void> {
    const dir = dirname(this.configPath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.configPath, JSON.stringify(config, null, 2) + "\n");
  }

  /**
   * Ensure a stable deviceId exists in the shared device.json file.
   * This file is NOT per-env — dev and prod share the same device ID.
   *
   * Migration: if the per-env config still has a legacy `deviceId` field,
   * it is moved to device.json and removed from the config file.
   */
  async ensureDeviceId(): Promise<string> {
    const devicePath = join(this.configDir, DEVICE_FILE);

    // 1. Try reading existing device.json
    try {
      const raw = await readFile(devicePath, "utf-8");
      const data = JSON.parse(raw) as { deviceId?: string };
      if (data.deviceId) {
        return data.deviceId;
      }
    } catch {
      // File doesn't exist or is corrupted — fall through
    }

    // 2. Migrate from legacy per-env config if present
    const config = await this.load();
    const deviceId = config.deviceId ?? randomUUID();

    // 3. Write shared device.json
    await mkdir(this.configDir, { recursive: true });
    await writeFile(
      devicePath,
      JSON.stringify({ deviceId }, null, 2) + "\n",
    );

    // 4. Remove legacy deviceId from per-env config (if it was there)
    if (config.deviceId) {
      const { deviceId: _, ...rest } = config;
      await this.save(rest as PewConfig);
    }

    return deviceId;
  }
}
