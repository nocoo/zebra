/**
 * POST /api/auth/code/verify — Verify a one-time code and return API key.
 *
 * Called by CLI with `pew login --code XXXX-XXXX`.
 * Returns the user's api_key (generating one if needed) and email.
 *
 * Security: Any failed verification attempt on an existing code immediately
 * invalidates it (failed_attempts > 0). Error messages are intentionally
 * generic to avoid leaking information about code existence.
 *
 * No session required — the code itself is the authentication.
 */

import { NextResponse } from "next/server";
import { getDbRead, getDbWrite } from "@/lib/db";

// Generic error message for all auth failures (avoids information leakage)
const AUTH_ERROR = "Invalid or expired code";

interface AuthCodeRow {
  code: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
  failed_attempts: number;
}

interface UserRow {
  id: string;
  email: string;
  api_key: string | null;
}

/** Generate a random API key: pk_ prefix + 32 hex chars */
function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `pk_${hex}`;
}

export async function POST(request: Request) {
  // 1. Parse and validate request body
  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = body.code?.trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  // Normalize: accept with or without hyphen
  const normalizedCode = code.includes("-") ? code : `${code.slice(0, 4)}-${code.slice(4)}`;

  const dbRead = await getDbRead();
  const dbWrite = await getDbWrite();

  try {
    // 2. Look up the code
    const authCode = await dbRead.firstOrNull<AuthCodeRow>(
      `SELECT code, user_id, expires_at, used_at, failed_attempts FROM auth_codes WHERE code = ?`,
      [normalizedCode]
    );

    // Code not found — return generic error
    if (!authCode) {
      return NextResponse.json({ error: AUTH_ERROR }, { status: 401 });
    }

    // 3. Check if code is still valid (not used, not expired, no failed attempts)
    const now = new Date();
    const expiresAt = new Date(authCode.expires_at);
    const isValid =
      !authCode.used_at &&
      now <= expiresAt &&
      authCode.failed_attempts === 0;

    if (!isValid) {
      // Code exists but is not valid — increment failed_attempts to ensure it stays invalid
      // (This handles edge case where code was valid but expired between check and now)
      await dbWrite.execute(
        `UPDATE auth_codes SET failed_attempts = failed_attempts + 1 WHERE code = ?`,
        [normalizedCode]
      );
      return NextResponse.json({ error: AUTH_ERROR }, { status: 401 });
    }

    // 4. Attempt to mark code as used (atomic)
    // Conditions: not used, no failed attempts, not expired (re-check in SQL for atomicity)
    const updateResult = await dbWrite.execute(
      `UPDATE auth_codes
       SET used_at = datetime('now')
       WHERE code = ? AND used_at IS NULL AND failed_attempts = 0`,
      [normalizedCode]
    );

    // If no rows updated, race condition — someone else invalidated or used it
    if (updateResult.changes === 0) {
      return NextResponse.json({ error: AUTH_ERROR }, { status: 401 });
    }

    // 5. Get user info and api_key
    const user = await dbRead.firstOrNull<UserRow>(
      `SELECT id, email, api_key FROM users WHERE id = ?`,
      [authCode.user_id]
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 500 });
    }

    let apiKey = user.api_key;

    // 6. Generate api_key if not exists
    if (!apiKey) {
      apiKey = generateApiKey();
      await dbWrite.execute(
        `UPDATE users SET api_key = ?, updated_at = datetime('now') WHERE id = ?`,
        [apiKey, user.id]
      );
    }

    return NextResponse.json({
      api_key: apiKey,
      email: user.email,
    });
  } catch (err) {
    console.error("Failed to verify auth code:", err);
    return NextResponse.json(
      { error: "Failed to verify code" },
      { status: 500 }
    );
  }
}
