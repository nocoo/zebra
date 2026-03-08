import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SessionQueueRecord } from "@pew/core";

const QUEUE_FILE = "session-queue.jsonl";
const STATE_FILE = "session-queue.state.json";

/**
 * Append-only local queue for session records.
 * Mirrors LocalQueue but uses separate files and SessionQueueRecord type.
 */
export class SessionQueue {
  readonly queuePath: string;
  private readonly statePath: string;
  private readonly dir: string;

  constructor(storeDir: string) {
    this.dir = storeDir;
    this.queuePath = join(storeDir, QUEUE_FILE);
    this.statePath = join(storeDir, STATE_FILE);
  }

  /** Ensure the directory exists */
  private async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  /** Append multiple records to the queue in a single write */
  async appendBatch(records: SessionQueueRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.ensureDir();
    const data = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await appendFile(this.queuePath, data);
  }

  /**
   * Read records from the queue starting at a byte offset.
   * Returns parsed records and the new offset (end of file).
   */
  async readFromOffset(offset: number): Promise<{
    records: SessionQueueRecord[];
    newOffset: number;
  }> {
    let raw: string;
    try {
      raw = await readFile(this.queuePath, "utf-8");
    } catch {
      return { records: [], newOffset: 0 };
    }

    const slice = raw.slice(offset);
    const lines = slice.split("\n").filter((line) => line.trim().length > 0);
    const records = lines.map(
      (line) => JSON.parse(line) as SessionQueueRecord,
    );
    const newOffset = Buffer.byteLength(raw, "utf-8");

    return { records, newOffset };
  }

  /** Save the upload byte offset to the state file */
  async saveOffset(offset: number): Promise<void> {
    await this.ensureDir();
    await writeFile(this.statePath, JSON.stringify({ offset }) + "\n");
  }

  /** Load the upload byte offset. Returns 0 if not found or corrupted. */
  async loadOffset(): Promise<number> {
    try {
      const raw = await readFile(this.statePath, "utf-8");
      const state = JSON.parse(raw) as { offset: number };
      return state.offset ?? 0;
    } catch {
      return 0;
    }
  }
}
