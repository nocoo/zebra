import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import type { PewConfig } from "@pew/core";

const PROD_CONFIG = "config.json";
const DEV_CONFIG = "config.dev.json";

/**
 * Manages the CLI configuration file.
 * Stored at ~/.config/pew/config.json (prod) or config.dev.json (dev).
 */
export class ConfigManager {
  readonly configPath: string;

  constructor(configDir: string, dev = false) {
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
   * Ensure the config has a stable deviceId.
   * Generates a UUID on first call and persists it.
   * Returns the deviceId (existing or newly created).
   */
  async ensureDeviceId(): Promise<string> {
    const config = await this.load();
    if (config.deviceId) {
      return config.deviceId;
    }
    config.deviceId = randomUUID();
    await this.save(config);
    return config.deviceId;
  }
}
