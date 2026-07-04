// Depends on Agent-1/2 output: `@/lib/features/extract`, `@/lib/scoring/dimensions`,
// and `@/lib/roles`. Those modules are being written in parallel; the imports
// below assume the interfaces documented in the task brief.

import type { AcousticFeatures, AnalysisProfile } from "@/types/core";

import { prisma } from "@/lib/prisma";
import { getASRProvider, getImageProvider, getLLMProvider } from "@/lib/providers";
import { extractAcousticFeatures } from "@/lib/features/extract";
import { scoreDimensions } from "@/lib/scoring/dimensions";
import { matchRole } from "@/lib/roles/match";
import { getAudioTtlHours } from "@/lib/storage";

// Note: `AnalysisResult` and `Card` type names collide with types/core, so we
// re-declare a light DB row shape via Prisma's return types instead.
type PrismaRecordingRow = Awaited<ReturnType<typeof prisma.recording.create>>;
type PrismaAnalysisResultRow = Awaited<ReturnType<typeof prisma.analysisResult.create>>;
type PrismaCardRow = Awaited<ReturnType<typeof prisma.card.create>>;

export interface RunAnalysisPipelineInput {
  /** Absolute path to the on-disk audio file. */
  audioPath: string;
  /** MIME type of the uploaded file, e.g. `audio/wav`. */
  mimeType: string;
  /** Anonymous owner id (from `echoid_anon` cookie). */
  ownerAnon: string;
}

export interface RunAnalysisPipelineOutput {
  recording: PrismaRecordingRow;
  result: PrismaAnalysisResultRow;
  card: PrismaCardRow;
  /** Convenience fields for callers that also want the raw pipeline artifacts. */
  features: AcousticFeatures;
  profile: AnalysisProfile;
}

/**
 * The orchestrator that turns raw audio into a persisted analysis + card.
 *
 * Steps:
 *   1. ASR transcribe (needed by feature extraction for word timing).
 *   2. Acoustic feature extraction (reads the audio + consumes ASR words).
 *   3. Six-dimension scoring.
 *   4. Role matching against the library.
 *   5. LLM profile generation (headline + card copy + image prompt).
 *   6. Image generation.
 *   7. Persist Recording → AnalysisResult → Card inside one transaction.
 */
export async function runAnalysisPipeline(
  input: RunAnalysisPipelineInput,
): Promise<RunAnalysisPipelineOutput> {
  const { audioPath, mimeType, ownerAnon } = input;

  const asr = getASRProvider();
  const llm = getLLMProvider();
  const image = getImageProvider();

  // ASR first — feature extraction needs the word timings.
  const asrResult = await asr.transcribe({ path: audioPath, mimeType });
  const features = await extractAcousticFeatures({ audioPath, mimeType, asrResult });

  const dimensions = scoreDimensions(features);
  const { role: matchedRole } = matchRole(dimensions);

  const profile = await llm.generateProfile({
    features,
    dimensions,
    matchedRole,
    transcript: asrResult.text,
  });

  const img = await image.generate(profile.imagePrompt, { roleId: matchedRole.id });

  const recordingId = crypto.randomUUID();
  const resultId = crypto.randomUUID();
  const cardId = crypto.randomUUID();

  const expiresAt = new Date(Date.now() + getAudioTtlHours() * 3600 * 1000);

  const [recording, result, card] = await prisma.$transaction([
    prisma.recording.create({
      data: {
        id: recordingId,
        ownerAnon,
        duration: features.duration,
        audioPath,
        status: "done",
        expiresAt,
      },
    }),
    prisma.analysisResult.create({
      data: {
        id: resultId,
        recordingId,
        featuresJson: JSON.stringify(features),
        dimensionsJson: JSON.stringify(profile.dimensions),
        matchedRoleId: matchedRole.id,
        headline: profile.headline,
        cardCopy: profile.cardCopy,
        imageUrl: img.url,
        transcript: asrResult.text,
      },
    }),
    prisma.card.create({
      data: {
        id: cardId,
        resultId,
        imageUrl: img.url,
        qrUrl: null,
        isPublic: true,
      },
    }),
  ]);

  return { recording, result, card, features, profile };
}
