// Anonymous session helpers.
// EchoID has no auth in MVP. We stamp a random uuid into an httpOnly cookie
// (`echoid_anon`) so each browser has a stable owner ID for its recordings.

import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

export const ANON_COOKIE = "echoid_anon";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Read the anon id from the incoming request cookies. Returns null when
 * absent — callers decide whether to mint a fresh one and set it on the
 * outgoing response.
 */
export function readAnonId(req?: NextRequest): string | null {
  if (req) return req.cookies.get(ANON_COOKIE)?.value ?? null;
  return cookies().get(ANON_COOKIE)?.value ?? null;
}

/**
 * Return the current anon id, or a freshly-minted one. When a new id is
 * generated, `setAnonCookie` MUST be called on the outgoing response to
 * persist it in the browser.
 */
export function getOrCreateAnonId(req?: NextRequest): { anonId: string; isNew: boolean } {
  const existing = readAnonId(req);
  if (existing) return { anonId: existing, isNew: false };
  return { anonId: crypto.randomUUID(), isNew: true };
}

/**
 * Attach the anon cookie to an outgoing `NextResponse`. httpOnly so client JS
 * can't tamper; sameSite=lax so the flow works from the share links too.
 */
export function setAnonCookie(res: NextResponse, anonId: string): void {
  res.cookies.set({
    name: ANON_COOKIE,
    value: anonId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}
