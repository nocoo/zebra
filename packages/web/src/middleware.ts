/**
 * Next.js middleware — defense-in-depth auth pre-check for /api/* routes.
 *
 * This is a lightweight gate: it rejects requests that present neither a
 * session cookie nor an `Authorization: Bearer` header. Individual routes
 * still call `resolveUser()` for the actual user object — the middleware
 * only prevents completely unauthenticated requests from reaching handlers.
 *
 * Public API routes (auth endpoints, leaderboard, live, public profiles,
 * ingest, health) are whitelisted and skip the check.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie names mirror the configuration in `auth.ts`.
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
] as const;

// Patterns for routes that bypass the middleware auth check.
// Anchored at the start; trailing `(.*)` accepts any sub-path.
const PUBLIC_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/api\/auth(\/.*)?$/,
  /^\/api\/leaderboard(\/.*)?$/,
  /^\/api\/live(\/.*)?$/,
  /^\/api\/users(\/.*)?$/,
  /^\/api\/ingest(\/.*)?$/,
  /^\/api\/health(\/.*)?$/,
];

/** True when the path is whitelisted as public. Exported for testing. */
export function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_ROUTE_PATTERNS.some((re) => re.test(pathname));
}

/** True when the request carries a session cookie or Bearer token. Exported for testing. */
export function hasAuthCredentials(req: NextRequest): boolean {
  for (const name of SESSION_COOKIE_NAMES) {
    const cookie = req.cookies.get(name);
    if (cookie?.value) return true;
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader && /^Bearer\s+\S+/i.test(authHeader)) return true;
  return false;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (isPublicApiRoute(pathname)) {
    return NextResponse.next();
  }

  if (hasAuthCredentials(req)) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
