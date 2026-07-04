// POST /api/analyze  — multipart upload → runs pipeline → returns partial payload.
//   Legacy shape: single `audio` blob, no `meta`.
//   VBTI shape:   `meta` (JSON) + repeated `audio` blobs.
// GET  /api/analyze  — with ?resultId=...&full=1 returns the full payload.

import { NextRequest, NextResponse } from "next/server";

import type {
  AcousticFeatures,
  AnalyzeFullResponse,
  AnalyzePartialResponse,
  AnalyzeSegmentedFullResponse,
  AnalyzeSegmentedMeta,
  AnalyzeSegmentedPartialResponse,
  Dimension,
  VbtiSubsystem,
} from "@/types/core";

import { prisma } from "@/lib/prisma";
import { getOrCreateAnonId, setAnonCookie } from "@/lib/session";
import { saveUploadedAudio } from "@/lib/storage";
import { runAnalysisPipeline } from "@/lib/pipeline";
import { runSegmentedAnalysisPipeline, saveSegmentBlob } from "@/lib/pipeline-segmented";
import { SUBSYSTEM_TITLES } from "@/lib/matching/config";

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

  const rawMeta = form.get("meta");
  if (typeof rawMeta === "string") {
    return handleSegmentedPost(req, form, rawMeta);
  }
  return handleLegacyPost(req, form);
}

async function handleLegacyPost(req: NextRequest, form: FormData): Promise<NextResponse> {
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

async function handleSegmentedPost(
  req: NextRequest,
  form: FormData,
  rawMeta: string,
): Promise<NextResponse> {
  let meta: AnalyzeSegmentedMeta;
  try {
    meta = JSON.parse(rawMeta) as AnalyzeSegmentedMeta;
  } catch (err) {
    return NextResponse.json(
      { error: "invalid meta JSON", detail: String(err) },
      { status: 400 },
    );
  }

  const audios = form.getAll("audio").filter((v): v is File => v instanceof Blob);
  if (audios.length === 0) {
    return NextResponse.json({ error: "missing field: audio" }, { status: 400 });
  }
  if (
    typeof meta.questionCount !== "number" ||
    meta.questionCount < 1 ||
    meta.questionCount > 10
  ) {
    return NextResponse.json({ error: "questionCount out of range (1..10)" }, { status: 400 });
  }
  if (meta.questionCount !== audios.length) {
    return NextResponse.json(
      {
        error: "questionCount does not match audio count",
        detail: `meta.questionCount=${meta.questionCount} audios=${audios.length}`,
      },
      { status: 400 },
    );
  }
  for (let i = 0; i < audios.length; i++) {
    if (audios[i].size === 0) {
      return NextResponse.json({ error: `empty audio blob at index ${i}` }, { status: 400 });
    }
  }

  const { anonId, isNew } = getOrCreateAnonId(req);
  const segments: Array<{ audioPath: string; mimeType: string }> = [];
  for (let i = 0; i < audios.length; i++) {
    const blob = audios[i];
    const mimeType = blob.type || "application/octet-stream";
    const { absPath } = await saveSegmentBlob({ blob, index: i + 1, mimeType });
    segments.push({ audioPath: absPath, mimeType });
  }

  let out;
  try {
    out = await runSegmentedAnalysisPipeline({
      ownerAnon: anonId,
      segments,
      stageDirection: meta.stageDirection,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "segmented pipeline failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const partial: AnalyzeSegmentedPartialResponse = {
    recordingId: out.recordingId,
    resultId: out.resultId,
    cardId: out.cardId,
    headline: out.headline,
    imageUrl: out.imageUrl,
    matchedSubsystem: out.matchedSubsystem,
    subsystemTitle: out.subsystemTitle,
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

  if (result.matchedSubsystem) {
    return respondSegmented(result, full === "1");
  }
  return respondLegacy(result, full === "1");
}

type LoadedResult = Awaited<ReturnType<typeof loadResult>>;
type ResultWithRelations = NonNullable<LoadedResult>;

async function loadResult(id: string) {
  return prisma.analysisResult.findUnique({
    where: { id },
    include: { recording: true, card: true },
  });
}

async function respondSegmented(
  result: ResultWithRelations,
  full: boolean,
): Promise<NextResponse> {
  const card = result.card!;
  const matchedSubsystem = result.matchedSubsystem! as VbtiSubsystem;
  const partial: AnalyzeSegmentedPartialResponse = {
    recordingId: result.recordingId,
    resultId: result.id,
    cardId: card.id,
    headline: result.headline,
    imageUrl: result.imageUrl,
    matchedSubsystem,
    subsystemTitle: SUBSYSTEM_TITLES[matchedSubsystem] ?? matchedSubsystem,
  };
  if (!full) return NextResponse.json(partial);

  const segments = await prisma.recordingSegment.findMany({
    where: { recordingId: result.recordingId },
    orderBy: { questionIndex: "asc" },
  });
  const payload: AnalyzeSegmentedFullResponse = {
    ...partial,
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

function respondLegacy(result: ResultWithRelations, full: boolean): NextResponse {
  const card = result.card!;
  if (!full) {
    const partial: AnalyzePartialResponse & { cardId: string } = {
      recordingId: result.recordingId,
      resultId: result.id,
      cardId: card.id,
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
    cardId: card.id,
    roleTitle: deriveRoleTitle(result.headline),
    headline: result.headline,
    imageUrl: result.imageUrl,
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
