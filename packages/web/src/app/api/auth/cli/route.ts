/**
 * GET /api/auth/cli — CLI login callback endpoint.
 *
 * Flow:
 * 1. CLI starts local HTTP server, opens browser to this URL with ?callback=...
 * 2. User is already signed in via Google OAuth (or redirected to /login first)
 * 3. This endpoint mints a new api_key for the user
 * 4. Redirects back to CLI's local server with api_key + email in query params
 *
 * Storage: only the SHA-256 hash and a short display prefix of the key are
 * persisted. The plain key is returned to the CLI exactly once via the
 * redirect query string and never stored — so each browser-based login
 * issues a fresh key, transparently rotating any previous one.
 *
 * Security: callback URL must be localhost or 127.0.0.1.
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getDbWrite } from "@/lib/db";
import { generateApiKey, hashApiKey, apiKeyPrefix } from "@/lib/api-key";

/**
 * Resolve the public-facing origin.
 *
 * Uses NEXTAUTH_URL when available (the canonical public URL configured at
 * deploy time). Falls back to the request URL origin for local development.
 *
 * We intentionally do NOT trust X-Forwarded-Host / X-Forwarded-Proto from the
 * request — those headers are attacker-controllable and were a security issue.
 */
export function getPublicOrigin(_request: Request): string {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/+$/, "");
  }

  return new URL(_request.url).origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callback = url.searchParams.get("callback");
  const state = url.searchParams.get("state");

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

  // 2. Validate callback parameter
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

  // Security: only allow localhost callbacks
  if (
    callbackUrl.hostname !== "localhost" &&
    callbackUrl.hostname !== "127.0.0.1"
  ) {
    return NextResponse.json(
      { error: "callback must be a localhost URL" },
      { status: 400 }
    );
  }

  // 3. Mint a fresh api_key. Plain keys are never persisted, so we cannot
  // return a previously-issued key — each browser login rotates it.
  const dbWrite = await getDbWrite();
  const userId = authResult.userId;
  const email = authResult.email ?? "";

  try {
    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);
    const apiKeyPrefixValue = apiKeyPrefix(apiKey);

    await dbWrite.execute(
      `UPDATE users
       SET api_key_hash = ?, api_key_prefix = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [apiKeyHash, apiKeyPrefixValue, userId]
    );

    // 4. Redirect back to CLI with api_key + state
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
