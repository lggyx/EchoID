/**
 * VBTI 5-segment analysis pipeline.
 *
 * This is the integration point for Track C's segmented upload contract and
 * Track A's real scoring/matching modules.
 */

import type { AcousticFeatures, StageDirection, VbtiSubsystem } from "@/types/core";

import { prisma } from "@/lib/prisma";
import { extractAcousticFeatures } from "@/lib/features/extract";
import { getASRProvider, getImageProvider, getLLMProvider } from "@/lib/providers";
import { keywordArousal } from "@/lib/providers/arousal-fallback";
import { getAudioTtlHours, saveUploadedAudio } from "@/lib/storage";
import { computeContrastResult, scoreVbtiSegment, type VbtiSegmentScoringInput } from "@/lib/scoring/vbti";
import { matchVbti } from "@/lib/matching/persona";
import { SUBSYSTEM_TITLES } from "@/lib/matching/config";
import { PERSONAS } from "@/lib/personas/personas";

export interface RunSegmentedPipelineInput {
  ownerAnon: string;
  segments: Array<{
    audioPath: string;
    mimeType: string;
    originalName?: string;
  }>;
  stageDirection?: StageDirection;
}

export interface RunSegmentedPipelineOutput {
  recordingId: string;
  resultId: string;
  cardId: string;
  matchedSubsystem: VbtiSubsystem;
  subsystemTitle: string;
  matchedPersonaId: string;
  headline: string;
  cardCopy: string;
  imageUrl: string;
  contrastRateAvg: number;
  dramaDensityAvg: number;
}

interface SegmentReading extends VbtiSegmentScoringInput {
  audioPath: string;
  mimeType: string;
  transcript: string;
}

export async function saveSegmentBlob(opts: {
  blob: Blob;
  index: number;
  mimeType: string;
}): Promise<{ absPath: string; relPath: string; ext: string }> {
  const data = Buffer.from(await opts.blob.arrayBuffer());
  return saveUploadedAudio({
    id: `${crypto.randomUUID()}-q${opts.index}`,
    mimeType: opts.mimeType,
    data,
  });
}

export async function runSegmentedAnalysisPipeline(
  input: RunSegmentedPipelineInput,
): Promise<RunSegmentedPipelineOutput> {
  if (input.segments.length === 0) {
    throw new Error("segmented pipeline requires at least one segment");
  }

  const asr = getASRProvider();
  const llm = getLLMProvider();
  const image = getImageProvider();

  const readings: SegmentReading[] = [];
  for (let i = 0; i < input.segments.length; i++) {
    const segment = input.segments[i];
    const questionIndex = i + 1;
    const asrResult = await asr.transcribe({
      path: segment.audioPath,
      mimeType: segment.mimeType,
    });
    const features = await extractAcousticFeatures({
      audioPath: segment.audioPath,
      mimeType: segment.mimeType,
      asrResult,
    });

    let semanticArousal = 0.5;
    try {
      semanticArousal = (await llm.extractArousal({
        transcript: asrResult.text,
        context: `VBTI question ${questionIndex}/${input.segments.length}`,
      })).arousal;
    } catch {
      semanticArousal = keywordArousal({ transcript: asrResult.text }).arousal;
    }

    readings.push({
      questionIndex,
      audioPath: segment.audioPath,
      mimeType: segment.mimeType,
      transcript: asrResult.text,
      features,
      semanticArousal,
    });
  }

  const contrast = computeContrastResult(readings);
  const match = matchVbti({
    vector: contrast,
    features: aggregateFeatures(readings.map((r) => r.features)),
    personas: PERSONAS,
  });
  const subsystemTitle = SUBSYSTEM_TITLES[match.matchedSubsystem];
  const headline = `你演得像${subsystemTitle}·${match.persona.title}`;
  const cardCopy = [
    `反差率 ${Math.round(contrast.contrastRateAvg)}% · 抓马浓度 ${Math.round(contrast.dramaDensityAvg)}%。`,
    match.persona.cardCopy,
  ].join("");
  const img = await image.generate("", { roleId: match.matchedPersonaId });

  const recordingId = crypto.randomUUID();
  const resultId = crypto.randomUUID();
  const cardId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + getAudioTtlHours() * 3600 * 1000);
  const scoredSegments = readings.map(scoreVbtiSegment);
  const totalDuration = readings.reduce((sum, reading) => sum + reading.features.duration, 0);

  await prisma.$transaction(async (tx) => {
    await tx.recording.create({
      data: {
        id: recordingId,
        ownerAnon: input.ownerAnon,
        duration: totalDuration,
        audioPath: null,
        status: "done",
        expiresAt,
        stageDirection: input.stageDirection ?? null,
      },
    });

    for (const segment of scoredSegments) {
      const source = readings.find((reading) => reading.questionIndex === segment.questionIndex)!;
      await tx.recordingSegment.create({
        data: {
          id: crypto.randomUUID(),
          recordingId,
          questionIndex: segment.questionIndex,
          audioPath: source.audioPath,
          duration: source.features.duration,
          transcript: source.transcript,
          featuresJson: JSON.stringify(source.features),
          semanticArousal: segment.semanticArousal,
          acousticArousal: segment.acousticArousal,
          contrastRate: segment.contrastRate,
          dramaDensity: segment.dramaDensity,
        },
      });
    }

    await tx.analysisResult.create({
      data: {
        id: resultId,
        recordingId,
        headline,
        cardCopy,
        imageUrl: img.url,
        contrastRateAvg: contrast.contrastRateAvg,
        contrastRateStd: contrast.contrastRateStd,
        dramaDensityAvg: contrast.dramaDensityAvg,
        z1SpeedStability: contrast.z1,
        z2VolumeStrength: contrast.z2,
        z3MonologueTendency: contrast.z3,
        triggeredSignatures: JSON.stringify(match.triggered.map((signal) => signal.id)),
        matchedSubsystem: match.matchedSubsystem,
        matchedPersonaId: match.matchedPersonaId,
        evidenceJson: JSON.stringify({
          evidence: contrast.evidence,
          triggered: match.triggered,
          personaReason: match.personaReason,
          poolPosition: match.poolPosition,
        }),
      },
    });

    await tx.card.create({
      data: {
        id: cardId,
        resultId,
        imageUrl: img.url,
        qrUrl: null,
        isPublic: true,
      },
    });
  });

  return {
    recordingId,
    resultId,
    cardId,
    matchedSubsystem: match.matchedSubsystem,
    subsystemTitle,
    matchedPersonaId: match.matchedPersonaId,
    headline,
    cardCopy,
    imageUrl: img.url,
    contrastRateAvg: contrast.contrastRateAvg,
    dramaDensityAvg: contrast.dramaDensityAvg,
  };
}

function aggregateFeatures(features: AcousticFeatures[]): AcousticFeatures {
  const avg = (pick: (f: AcousticFeatures) => number) =>
    features.reduce((sum, feature) => sum + pick(feature), 0) / Math.max(1, features.length);
  return {
    duration: features.reduce((sum, feature) => sum + feature.duration, 0),
    speechRate: avg((f) => f.speechRate),
    speechRateVar: avg((f) => f.speechRateVar),
    pauseCount: Math.round(features.reduce((sum, feature) => sum + feature.pauseCount, 0)),
    pauseDurAvg: avg((f) => f.pauseDurAvg),
    pauseRatio: avg((f) => f.pauseRatio),
    f0Mean: avg((f) => f.f0Mean),
    f0Std: avg((f) => f.f0Std),
    f0Range: avg((f) => f.f0Range),
    rmsMean: avg((f) => f.rmsMean),
    rmsDr: avg((f) => f.rmsDr),
    pitchSlopeEnd: avg((f) => f.pitchSlopeEnd),
    fillerRate: avg((f) => f.fillerRate),
    ttr: avg((f) => f.ttr),
    sentLen: avg((f) => f.sentLen),
    peakDensity: avg((f) => f.peakDensity),
    pauseRegularity: avg((f) => f.pauseRegularity),
    burstStops: Math.round(features.reduce((sum, feature) => sum + feature.burstStops, 0)),
  };
}
