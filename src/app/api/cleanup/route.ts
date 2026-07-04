// POST /api/cleanup  — maintenance endpoint that TTL-prunes stale audio.
// No auth in MVP; call manually (`curl -XPOST .../api/cleanup`).

import { NextResponse } from "next/server";
import { cleanupExpiredAudio, getAudioTtlHours } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const removed = await cleanupExpiredAudio();
  return NextResponse.json({
    ok: true,
    removed,
    ttlHours: getAudioTtlHours(),
    at: new Date().toISOString(),
  });
}
