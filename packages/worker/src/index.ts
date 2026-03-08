/**
 * Zebra Ingest Worker — Cloudflare Worker with native D1 bindings.
 *
 * Receives pre-validated usage records from Next.js and performs
 * atomic batch upserts via env.DB.batch().
 *
 * Auth: shared secret (WORKER_SECRET) between Next.js and this Worker.
 * Limit: max 50 records per request (D1 Free plan: 50 queries/invocation).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Env {
  DB: D1Database;
  WORKER_SECRET: string;
}

export interface IngestRecord {
  source: string;
  model: string;
  hour_start: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
}

export interface IngestRequest {
  userId: string;
  records: IngestRecord[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max records per Worker invocation (D1 Free: 50 queries/invocation). */
export const MAX_RECORDS = 50;

const UPSERT_SQL = `INSERT INTO usage_records
  (user_id, source, model, hour_start,
   input_tokens, cached_input_tokens, output_tokens,
   reasoning_output_tokens, total_tokens)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (user_id, source, model, hour_start) DO UPDATE SET
   input_tokens = excluded.input_tokens,
   cached_input_tokens = excluded.cached_input_tokens,
   output_tokens = excluded.output_tokens,
   reasoning_output_tokens = excluded.reasoning_output_tokens,
   total_tokens = excluded.total_tokens`;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateRequest(body: unknown): { ok: true; data: IngestRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request body" };
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.userId !== "string" || obj.userId.length === 0) {
    return { ok: false, error: "Missing or empty userId" };
  }

  if (!Array.isArray(obj.records) || obj.records.length === 0) {
    return { ok: false, error: "Missing or empty records array" };
  }

  if (obj.records.length > MAX_RECORDS) {
    return { ok: false, error: `Batch too large: max ${MAX_RECORDS} records` };
  }

  // Lightweight field presence check (full validation done by Next.js)
  for (let i = 0; i < obj.records.length; i++) {
    const r = obj.records[i] as Record<string, unknown>;
    if (typeof r.source !== "string" || typeof r.model !== "string" || typeof r.hour_start !== "string") {
      return { ok: false, error: `record[${i}]: missing required string fields` };
    }
    const numFields = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];
    for (const f of numFields) {
      if (typeof r[f] !== "number") {
        return { ok: false, error: `record[${i}]: ${f} must be a number` };
      }
    }
  }

  return { ok: true, data: obj as unknown as IngestRequest };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Method check
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // 2. Shared secret auth
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${env.WORKER_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validation = validateRequest(body);
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    const { userId, records } = validation.data;

    // 4. Build prepared statements and execute batch
    try {
      const stmts = records.map((r) =>
        env.DB.prepare(UPSERT_SQL).bind(
          userId,
          r.source,
          r.model,
          r.hour_start,
          r.input_tokens,
          r.cached_input_tokens,
          r.output_tokens,
          r.reasoning_output_tokens,
          r.total_tokens,
        ),
      );

      await env.DB.batch(stmts);

      return Response.json({ ingested: records.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ error: `D1 batch failed: ${message}` }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
