// GET /api/card/[cardId]  — returns AnalyzeFullResponse keyed by cardId.

import { NextRequest, NextResponse } from "next/server";

import type {
  AcousticFeatures,
  AnalyzeFullResponse,
  AnalyzeSegmentedFullResponse,
  Dimension,
  VbtiSubsystem,
} from "@/types/core";
import { prisma } from "@/lib/prisma";
import { SUBSYSTEM_TITLES } from "@/lib/matching/config";

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
  if (result.matchedSubsystem) {
    const matchedSubsystem = result.matchedSubsystem as VbtiSubsystem;
    const segments = await prisma.recordingSegment.findMany({
      where: { recordingId: result.recordingId },
      orderBy: { questionIndex: "asc" },
    });
    const payload: AnalyzeSegmentedFullResponse = {
      recordingId: result.recordingId,
      resultId: result.id,
      cardId: card.id,
      headline: result.headline,
      imageUrl: card.imageUrl,
      matchedSubsystem,
      subsystemTitle: SUBSYSTEM_TITLES[matchedSubsystem],
      cardCopy: result.cardCopy,
      contrastRateAvg: result.contrastRateAvg ?? 0,
      contrastRateStd: result.contrastRateStd ?? 0,
      dramaDensityAvg: result.dramaDensityAvg ?? 0,
      z1SpeedStability: result.z1SpeedStability ?? 0,
      z2VolumeStrength: result.z2VolumeStrength ?? 0,
      z3MonologueTendency: result.z3MonologueTendency ?? 0,
      matchedPersonaId: result.matchedPersonaId ?? "",
      evidenceJson: result.evidenceJson ? safeParse<unknown>(result.evidenceJson) : null,
      segmentsSummary: segments.map((segment) => ({
        questionIndex: segment.questionIndex,
        transcript: segment.transcript,
        contrastRate: segment.contrastRate ?? 0,
        dramaDensity: segment.dramaDensity ?? 0,
      })),
    };
    return NextResponse.json(payload);
  }

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
