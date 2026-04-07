/**
 * GET /api/auth/cli — CLI login callback endpoint.
 *
 * Normal flow (browser-based):
 * 1. CLI starts local HTTP server, opens browser to this URL with ?callback=...
 * 2. User is already signed in via Google OAuth (or redirected to /login first)
 * 3. This endpoint fetches/generates user's api_key
 * 4. Redirects back to CLI's local server with api_key + email in query params
 *
 * Headless flow:
 * 1. CLI generates session_id, sends user to this URL with ?headless={session_id}
 * 2. User authenticates via Google OAuth
 * 3. This endpoint stores api_key + email in cli_auth_sessions table
 * 4. Shows success page; CLI polls /api/auth/cli/poll to retrieve token
 *
 * Security: In normal mode, callback URL must be localhost or 127.0.0.1.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getDbRead, getDbWrite } from "@/lib/db";

/**
 * Resolve the public-facing origin from the request.
 *
 * In production behind Railway's reverse proxy, `request.url` contains the
 * internal container URL (e.g. `http://0.0.0.0:8080`). We must use the
 * forwarded headers or NEXTAUTH_URL to construct the correct public origin.
 */
export function getPublicOrigin(request: Request): string {
  const fwdHost = request.headers.get("x-forwarded-host");
  if (fwdHost) {
    const fwdProto = request.headers.get("x-forwarded-proto") || "https";
    return `${fwdProto}://${fwdHost}`;
  }

  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }

  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callback = url.searchParams.get("callback");
  const state = url.searchParams.get("state");
  const headlessSession = url.searchParams.get("headless");

  // 1. Check authentication
  const authResult = await resolveUser(request);
  if (!authResult) {
    // Redirect to login page, preserving the return URL
    const returnUrl = url.pathname + url.search;
    const origin = getPublicOrigin(request);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(returnUrl)}`, origin)
    );
  }

  // 2. Get or generate api_key
  const dbRead = await getDbRead();
  const dbWrite = await getDbWrite();
  const userId = authResult.userId;
  const email = authResult.email ?? "";

  try {
    const row = await dbRead.firstOrNull<{ api_key: string | null }>(
      "SELECT api_key FROM users WHERE id = ?",
      [userId]
    );

    let apiKey = row?.api_key;

    if (!apiKey) {
      apiKey = generateApiKey();
      await dbWrite.execute(
        "UPDATE users SET api_key = ?, updated_at = datetime('now') WHERE id = ?",
        [apiKey, userId]
      );
    }

    // --- Headless flow: store token for CLI to poll ---
    if (headlessSession) {
      // Validate session_id format (hex string, 16-64 chars)
      if (!/^[a-f0-9]{16,64}$/i.test(headlessSession)) {
        return NextResponse.json(
          { error: "Invalid session format" },
          { status: 400 }
        );
      }

      // Store in cli_auth_sessions (CLI polls /api/auth/cli/poll to retrieve)
      await dbWrite.execute(
        `INSERT OR REPLACE INTO cli_auth_sessions (session_id, api_key, email, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [headlessSession, apiKey, email]
      );

      // Return success HTML page
      return new Response(headlessSuccessHtml(email), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // --- Normal flow: redirect to localhost callback ---
    if (!callback) {
      return NextResponse.json(
        { error: "Missing callback parameter" },
        { status: 400 }
      );
    }

    let callbackUrl: URL;
    try {
      callbackUrl = new URL(callback);
    } catch {
      return NextResponse.json(
        { error: "Invalid callback URL" },
        { status: 400 }
      );
    }

    if (
      callbackUrl.hostname !== "localhost" &&
      callbackUrl.hostname !== "127.0.0.1"
    ) {
      return NextResponse.json(
        { error: "callback must be a localhost URL" },
        { status: 400 }
      );
    }

    const redirectUrl = new URL(callbackUrl.toString());
    redirectUrl.searchParams.set("api_key", apiKey);
    redirectUrl.searchParams.set("email", email);
    if (state) {
      redirectUrl.searchParams.set("state", state);
    }

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("CLI auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** Generate a random API key: pk_ prefix + 32 hex chars */
function generateApiKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return `pk_${hex}`;
}

/** HTML success page shown after headless CLI auth completes. */
function headlessSuccessHtml(email: string): string {
  const safeEmail = email
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CLI Login Successful — pew</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #171717; color: #e5e5e5;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
    }
    .container { text-align: center; padding: 2rem; }
    .icon {
      width: 64px; height: 64px; margin: 0 auto 1.5rem;
      background: #1f1f1f; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .icon svg { width: 32px; height: 32px; color: #22c55e; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; color: #fafafa; }
    p { font-size: 0.875rem; color: #737373; margin-bottom: 1rem; }
    .hint { font-size: 0.75rem; color: #525252; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h1>CLI Login Successful</h1>
    <p>Authenticated as <strong>${safeEmail}</strong></p>
    <p>Your CLI session is now active. You can close this window.</p>
    <p class="hint">The CLI will pick up the token automatically.</p>
  </div>
</body>
</html>`;
}
