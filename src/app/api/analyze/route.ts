// POST /api/analyze  — multipart upload → runs pipeline → returns partial payload.
// GET  /api/analyze  — with ?resultId=...&full=1 returns the full payload.

import { NextRequest, NextResponse } from "next/server";

import type {
  AcousticFeatures,
  AnalyzeFullResponse,
  AnalyzePartialResponse,
  Dimension,
} from "@/types/core";

import { prisma } from "@/lib/prisma";
import { getOrCreateAnonId, setAnonCookie } from "@/lib/session";
import { saveUploadedAudio } from "@/lib/storage";
import { runAnalysisPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: "invalid multipart body", detail: String(err) },
      { status: 400 },
    );
  }

  const file = form.get("audio");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "missing field: audio" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty audio blob" }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  const { anonId, isNew } = getOrCreateAnonId(req);

  const buffer = Buffer.from(await file.arrayBuffer());
  const audioId = crypto.randomUUID();
  const { absPath } = await saveUploadedAudio({ id: audioId, mimeType, data: buffer });

  let out;
  try {
    out = await runAnalysisPipeline({ audioPath: absPath, mimeType, ownerAnon: anonId });
  } catch (err) {
    return NextResponse.json(
      { error: "pipeline failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  const partial: AnalyzePartialResponse & { cardId: string } = {
    recordingId: out.recording.id,
    resultId: out.result.id,
    cardId: out.card.id,
    roleTitle: out.profile.roleTitle,
    headline: out.profile.headline,
    imageUrl: out.result.imageUrl,
  };

  const res = NextResponse.json(partial, { status: 200 });
  if (isNew) setAnonCookie(res, anonId);
  return res;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const resultId = url.searchParams.get("resultId");
  const full = url.searchParams.get("full");

  if (!resultId) {
    return NextResponse.json({ error: "missing resultId" }, { status: 400 });
  }

  const result = await prisma.analysisResult.findUnique({
    where: { id: resultId },
    include: { recording: true, card: true },
  });
  if (!result) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!result.card) {
    return NextResponse.json({ error: "card not ready" }, { status: 409 });
  }

  if (full !== "1") {
    const partial: AnalyzePartialResponse & { cardId: string } = {
      recordingId: result.recordingId,
      resultId: result.id,
      cardId: result.card.id,
      roleTitle: deriveRoleTitle(result.headline),
      headline: result.headline,
      imageUrl: result.imageUrl,
    };
    return NextResponse.json(partial);
  }

  const features = safeParse<AcousticFeatures>(result.featuresJson);
  const dimensions = safeParse<Dimension[]>(result.dimensionsJson);
  if (!features || !dimensions) {
    return NextResponse.json({ error: "corrupt result payload" }, { status: 500 });
  }

  const payload: AnalyzeFullResponse = {
    recordingId: result.recordingId,
    resultId: result.id,
    cardId: result.card.id,
    roleTitle: deriveRoleTitle(result.headline),
    headline: result.headline,
    imageUrl: result.imageUrl,
    dimensions,
    features,
    cardCopy: result.cardCopy,
  };
  return NextResponse.json(payload);
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * The DB doesn't store roleTitle separately (it's derived from the matched role
 * at pipeline time and baked into the headline "你说话像<title>"). For the
 * partial/full response we peel it back out of the headline; if the format
 * changes we fall back to the raw headline.
 */
function deriveRoleTitle(headline: string): string {
  const m = headline.match(/^你说话像(.+?)$/);
  return m ? m[1] : headline;
}
