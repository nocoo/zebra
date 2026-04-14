/**
 * GET /api/auth/cli — CLI login callback endpoint.
 *
 * Flow:
 * 1. CLI starts local HTTP server, opens browser to this URL with ?callback=...
 * 2. User is already signed in via Google OAuth (or redirected to /login first)
 * 3. This endpoint fetches/generates user's api_key (stored as SHA-256 hash)
 * 4. Redirects back to CLI's local server with api_key in URL fragment (not query string)
 *
 * Security:
 * - Callback URL must be localhost or 127.0.0.1
 * - API key is passed via URL fragment to avoid CWE-598 (query string exposure)
 * - API key is stored as SHA-256 hash — the raw key is only shown once at creation
 */

import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-helpers";
import { getDbRead, getDbWrite } from "@/lib/db";
import { generateApiKey, hashApiKey } from "@/lib/crypto-utils";

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

  // 3. Get or generate api_key
  const dbRead = await getDbRead();
  const dbWrite = await getDbWrite();
  const userId = authResult.userId;
  const email = authResult.email ?? "";

  try {
    const existingKey = await dbRead.getUserApiKey(userId);
    let rawApiKey: string;

    if (!existingKey) {
      // Generate a new api_key and store as SHA-256 hash
      const newKey = generateApiKey();
      const hashedKey = hashApiKey(newKey);
      // Use atomic conditional update to guard against race conditions
      const updateResult = await dbWrite.execute(
        "UPDATE users SET api_key = ?, updated_at = datetime('now') WHERE id = ? AND api_key IS NULL",
        [hashedKey, userId]
      );

      if (updateResult.changes === 1) {
        rawApiKey = newKey;
      } else {
        // Another request already set a key — cannot recover raw key from hash
        return NextResponse.json(
          { error: "API key already exists. Use your existing key or reset it." },
          { status: 409 }
        );
      }
    } else if (existingKey.startsWith("hash:")) {
      // Already hashed — cannot recover raw key
      return NextResponse.json(
        { error: "API key already exists. Use your existing key or reset it." },
        { status: 409 }
      );
    } else {
      // Legacy plaintext key — return it
      rawApiKey = existingKey;
    }

    // 4. Redirect back to CLI with api_key in URL fragment (not query string).
    // Fragments are NOT sent to servers, not logged in proxy/access logs,
    // and not stored in most browser history implementations (CWE-598 mitigation).
    const redirectUrl = new URL(callbackUrl.toString());
    if (state) {
      redirectUrl.searchParams.set("state", state);
    }
    // Append credentials as fragment — CLI local server parses fragment via JS
    redirectUrl.hash = `api_key=${encodeURIComponent(rawApiKey)}&email=${encodeURIComponent(email)}`;

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("CLI auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
