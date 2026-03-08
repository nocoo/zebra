/**
 * Pew Ingest Worker — Cloudflare Worker with native D1 bindings.
 *
 * Receives pre-validated records from Next.js and performs
 * atomic batch upserts via env.DB.batch().
 *
 * Routes:
 * - POST /ingest/tokens  — token usage records (also legacy /ingest)
 * - POST /ingest/sessions — session snapshot records
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

export interface SessionIngestRecord {
  session_key: string;
  source: string;
  kind: string;
  started_at: string;
  last_message_at: string;
  duration_seconds: number;
  user_messages: number;
  assistant_messages: number;
  total_messages: number;
  project_ref: string | null;
  model: string | null;
  snapshot_at: string;
}

export interface SessionIngestRequest {
  userId: string;
  records: SessionIngestRecord[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max records per Worker invocation (D1 Free: 50 queries/invocation). */
export const MAX_RECORDS = 50;

const TOKEN_UPSERT_SQL = `INSERT INTO usage_records
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

const SESSION_UPSERT_SQL = `INSERT INTO session_records
  (user_id, session_key, source, kind, started_at, last_message_at,
   duration_seconds, user_messages, assistant_messages, total_messages,
   project_ref, model, snapshot_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
ON CONFLICT (user_id, session_key) DO UPDATE SET
  source = excluded.source,
  kind = excluded.kind,
  started_at = excluded.started_at,
  last_message_at = excluded.last_message_at,
  duration_seconds = excluded.duration_seconds,
  user_messages = excluded.user_messages,
  assistant_messages = excluded.assistant_messages,
  total_messages = excluded.total_messages,
  project_ref = excluded.project_ref,
  model = excluded.model,
  snapshot_at = excluded.snapshot_at,
  updated_at = datetime('now')
WHERE excluded.snapshot_at >= session_records.snapshot_at`;

// ---------------------------------------------------------------------------
// Validation — Token records
// ---------------------------------------------------------------------------

function validateTokenRequest(body: unknown): { ok: true; data: IngestRequest } | { ok: false; error: string } {
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
// Validation — Session records
// ---------------------------------------------------------------------------

function validateSessionRequest(body: unknown): { ok: true; data: SessionIngestRequest } | { ok: false; error: string } {
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

  for (let i = 0; i < obj.records.length; i++) {
    const r = obj.records[i] as Record<string, unknown>;

    // Required string fields
    const requiredStrings = ["session_key", "source", "kind", "started_at", "last_message_at", "snapshot_at"];
    for (const f of requiredStrings) {
      if (typeof r[f] !== "string") {
        return { ok: false, error: `record[${i}]: ${f} must be a string` };
      }
    }

    // Required number fields
    const requiredNumbers = ["duration_seconds", "user_messages", "assistant_messages", "total_messages"];
    for (const f of requiredNumbers) {
      if (typeof r[f] !== "number") {
        return { ok: false, error: `record[${i}]: ${f} must be a number` };
      }
    }

    // Nullable string fields (string or null)
    for (const f of ["project_ref", "model"]) {
      if (r[f] !== null && typeof r[f] !== "string") {
        return { ok: false, error: `record[${i}]: ${f} must be a string or null` };
      }
    }
  }

  return { ok: true, data: obj as unknown as SessionIngestRequest };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleTokenIngest(body: unknown, env: Env): Promise<Response> {
  const validation = validateTokenRequest(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const { userId, records } = validation.data;

  try {
    const stmts = records.map((r) =>
      env.DB.prepare(TOKEN_UPSERT_SQL).bind(
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
}

async function handleSessionIngest(body: unknown, env: Env): Promise<Response> {
  const validation = validateSessionRequest(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const { userId, records } = validation.data;

  try {
    const stmts = records.map((r) =>
      env.DB.prepare(SESSION_UPSERT_SQL).bind(
        userId,
        r.session_key,
        r.source,
        r.kind,
        r.started_at,
        r.last_message_at,
        r.duration_seconds,
        r.user_messages,
        r.assistant_messages,
        r.total_messages,
        r.project_ref,
        r.model,
        r.snapshot_at,
      ),
    );

    await env.DB.batch(stmts);

    return Response.json({ ingested: records.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `D1 batch failed: ${message}` }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Router
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

    // 3. Parse JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 4. Route by URL path
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/ingest/sessions") {
      return handleSessionIngest(body, env);
    }

    if (path === "/ingest/tokens" || path === "/ingest") {
      return handleTokenIngest(body, env);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
