// GET /api/card/[cardId]  — returns AnalyzeFullResponse keyed by cardId.

import { NextRequest, NextResponse } from "next/server";

import type {
  AcousticFeatures,
  AnalyzeFullResponse,
  Dimension,
} from "@/types/core";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { cardId: string } },
): Promise<NextResponse> {
  const card = await prisma.card.findUnique({
    where: { id: params.cardId },
    include: { result: true },
  });
  if (!card) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!card.isPublic) {
    return NextResponse.json({ error: "private card" }, { status: 403 });
  }

  const { result } = card;
  const features = safeParse<AcousticFeatures>(result.featuresJson);
  const dimensions = safeParse<Dimension[]>(result.dimensionsJson);
  if (!features || !dimensions) {
    return NextResponse.json({ error: "corrupt result payload" }, { status: 500 });
  }

  const payload: AnalyzeFullResponse = {
    recordingId: result.recordingId,
    resultId: result.id,
    cardId: card.id,
    roleTitle: deriveRoleTitle(result.headline),
    headline: result.headline,
    imageUrl: card.imageUrl,
    dimensions,
    features,
    cardCopy: result.cardCopy,
  };
  return NextResponse.json(payload);
}

function safeParse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function deriveRoleTitle(headline: string): string {
  const m = headline.match(/^你说话像(.+?)$/);
  return m ? m[1] : headline;
}
