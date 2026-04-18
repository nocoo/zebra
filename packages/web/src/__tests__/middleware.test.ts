import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

import {
  hasAuthCredentials,
  isPublicApiRoute,
  middleware,
} from "@/middleware";

function makeReq(
  pathname: string,
  init: { headers?: Record<string, string>; cookies?: Record<string, string> } = {},
): NextRequest {
  const url = `https://pew.example.com${pathname}`;
  const req = new NextRequest(url, { headers: init.headers ?? {} });
  if (init.cookies) {
    for (const [name, value] of Object.entries(init.cookies)) {
      req.cookies.set(name, value);
    }
  }
  return req;
}

describe("isPublicApiRoute", () => {
  it.each([
    "/api/auth/signin",
    "/api/auth/callback/google",
    "/api/leaderboard",
    "/api/leaderboard/season/foo",
    "/api/live",
    "/api/users/abc",
    "/api/ingest",
    "/api/health",
  ])("treats %s as public", (path) => {
    expect(isPublicApiRoute(path)).toBe(true);
  });

  it.each([
    "/api/sessions",
    "/api/admin/users",
    "/api/account",
    "/api/teams/123",
    "/api/leaderboardx", // not a prefix match — must include `/` or end
  ])("treats %s as protected", (path) => {
    expect(isPublicApiRoute(path)).toBe(false);
  });
});

describe("hasAuthCredentials", () => {
  it("returns false when no cookie or auth header", () => {
    expect(hasAuthCredentials(makeReq("/api/sessions"))).toBe(false);
  });

  it("returns true with insecure session cookie", () => {
    const req = makeReq("/api/sessions", {
      cookies: { "authjs.session-token": "abc" },
    });
    expect(hasAuthCredentials(req)).toBe(true);
  });

  it("returns true with __Secure- session cookie", () => {
    const req = makeReq("/api/sessions", {
      cookies: { "__Secure-authjs.session-token": "abc" },
    });
    expect(hasAuthCredentials(req)).toBe(true);
  });

  it("returns true with Bearer authorization header", () => {
    const req = makeReq("/api/sessions", {
      headers: { authorization: "Bearer some-token" },
    });
    expect(hasAuthCredentials(req)).toBe(true);
  });

  it("ignores non-Bearer authorization header", () => {
    const req = makeReq("/api/sessions", {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(hasAuthCredentials(req)).toBe(false);
  });

  it("ignores empty Bearer header", () => {
    const req = makeReq("/api/sessions", {
      headers: { authorization: "Bearer " },
    });
    expect(hasAuthCredentials(req)).toBe(false);
  });
});

describe("middleware", () => {
  it("allows public routes without credentials", () => {
    const res = middleware(makeReq("/api/leaderboard"));
    expect(res.status).toBe(200);
  });

  it("allows ingest without credentials (has its own API key)", () => {
    const res = middleware(makeReq("/api/ingest"));
    expect(res.status).toBe(200);
  });

  it("allows authed requests on protected routes", () => {
    const res = middleware(
      makeReq("/api/sessions", {
        cookies: { "authjs.session-token": "abc" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("allows Bearer-token requests on protected routes", () => {
    const res = middleware(
      makeReq("/api/admin/users", {
        headers: { authorization: "Bearer xyz" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 JSON on protected routes without credentials", async () => {
    const res = middleware(makeReq("/api/sessions"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 on /api/admin without credentials", async () => {
    const res = middleware(makeReq("/api/admin/users"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });
});
