/**
 * VBTI 5-segment analysis pipeline.
 *
 * Kept in a separate file from the legacy `pipeline.ts` so:
 *   - Track A/B can keep using the single-segment path while VBTI matures.
 *   - Rollback is a one-line switch in the API route.
 *
 * Contract (PRD-VBTI-v1.1 §5.2):
 *   1. For each segment i in 1..N (typically 5):
 *        - ASR transcribes segment audio.
 *        - DSP extracts acoustic features from the segment.
 *   2. LLM extracts semantic arousal per segment (5 parallel calls, with
 *      keyword fallback). Combined with the DSP's acoustic arousal to get
 *      per-segment contrast rate = |sem - ac| * 100.
 *   3. Aggregate contrast/drama across segments (mean + std). Compute
 *      z1/z2/z3 on combined audio (§3.2 "robust vs fragile feature split").
 *   4. Match subsystem (5-D Manhattan + signature trigger) and persona.
 *      **Stub in this branch** — Track A owns matching/scoring. Placeholder
 *      returns a fixed subsystem/persona so the row is persistable.
 *   5. Persist Recording + RecordingSegment[] + AnalysisResult + Card in
 *      one transaction.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ArousalResult,
  AcousticFeatures,
  StageDirection,
} from "@/types/core";

import { prisma } from "@/lib/prisma";
import { getASRProvider, getLLMProvider, getImageProvider } from "@/lib/providers";
import { extractAcousticFeatures } from "@/lib/features/extract";
import { keywordArousal } from "@/lib/providers/arousal-fallback";
import { getAudioTtlHours, saveUploadedAudio } from "@/lib/storage";

export interface RunSegmentedPipelineInput {
  ownerAnon: string;
  /** One entry per question, in question-index order (1..N). */
  segments: Array<{
    /** Absolute path on disk where the segment audio has already been saved. */
    audioPath: string;
    mimeType: string;
    /** For rollback / debugging — the original filename from the multipart part. */
    originalName?: string;
  }>;
  stageDirection?: StageDirection;
}

export interface RunSegmentedPipelineOutput {
  recordingId: string;
  resultId: string;
  cardId: string;
  matchedSubsystem: string;
  subsystemTitle: string;
  matchedPersonaId: string;
  headline: string;
  cardCopy: string;
  imageUrl: string;
  contrastRateAvg: number;
  dramaDensityAvg: number;
}

/**
 * Per-segment intermediate result used for aggregation.
 */
interface SegmentReading {
  index: number;
  audioPath: string;
  duration: number;
  transcript: string;
  features: AcousticFeatures;
  semanticArousal: number;
  acousticArousal: number;
  contrastRate: number;
  dramaDensity: number;
}

export async function runSegmentedAnalysisPipeline(
  input: RunSegmentedPipelineInput,
): Promise<RunSegmentedPipelineOutput> {
  const { ownerAnon, segments, stageDirection } = input;
  if (segments.length === 0) {
    throw new Error("segmented pipeline requires at least one segment");
  }

  const asr = getASRProvider();
  const llm = getLLMProvider();
  const image = getImageProvider();

  // Step 1+2: per-segment ASR + DSP. ASR is CPU-bound in the sidecar (single
  // model instance), so we serialize the ASR calls to avoid thrash — see PRD
  // §5.3. DSP is fast local JS and could parallelize but staying sequential
  // keeps memory predictable and preserves index ordering.
  const readings: SegmentReading[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const asrResult = await asr.transcribe({ path: seg.audioPath, mimeType: seg.mimeType });
    const features = await extractAcousticFeatures({
      audioPath: seg.audioPath,
      mimeType: seg.mimeType,
      asrResult,
    });

    // Semantic arousal: real LLM if configured, keyword otherwise. Never
    // throws — the LLM implementation guarantees fallback on network errors.
    let semantic: ArousalResult;
    try {
      semantic = await llm.extractArousal({
        transcript: asrResult.text,
        context: `VBTI question ${i + 1}/${segments.length}`,
      });
    } catch (err) {
      // Extra defense: if the provider somehow throws, drop to keyword.
      console.warn(`[pipeline] segment ${i + 1} arousal fallback:`, (err as Error).message);
      semantic = keywordArousal({ transcript: asrResult.text });
    }

    const acoustic = deriveAcousticArousal(features);
    const contrast = Math.abs(semantic.arousal - acoustic) * 100;
    const drama = deriveDramaDensity(features);

    readings.push({
      index: i + 1,
      audioPath: seg.audioPath,
      duration: features.duration,
      transcript: asrResult.text,
      features,
      semanticArousal: semantic.arousal,
      acousticArousal: acoustic,
      contrastRate: contrast,
      dramaDensity: drama,
    });
  }

  // Step 3: aggregate.
  const contrasts = readings.map((r) => r.contrastRate);
  const dramas = readings.map((r) => r.dramaDensity);
  const contrastAvg = mean(contrasts);
  const contrastStd = std(contrasts);
  const dramaAvg = mean(dramas);
  const { z1, z2, z3 } = aggregateAuxiliaryAxes(readings);

  // Step 4: matching. STUB — Track A owns the real logic. This picks the
  // best guess based on the two headline axes so the returned row is
  // structurally correct and the UI has something plausible to render.
  const { matchedSubsystem, subsystemTitle, matchedPersonaId, headline, cardCopy } =
    placeholderMatch({
      contrastAvg,
      dramaAvg,
      z1,
      z2,
      z3,
      stageDirection,
    });

  const img = await image.generate("", { roleId: matchedPersonaId });

  // Step 5: persist.
  const recordingId = crypto.randomUUID();
  const resultId = crypto.randomUUID();
  const cardId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + getAudioTtlHours() * 3600 * 1000);
  const totalDuration = readings.reduce((s, r) => s + r.duration, 0);

  await prisma.$transaction(async (tx) => {
    await tx.recording.create({
      data: {
        id: recordingId,
        ownerAnon,
        duration: totalDuration,
        audioPath: null,
        status: "done",
        expiresAt,
        stageDirection: stageDirection ?? null,
      },
    });
    for (const r of readings) {
      await tx.recordingSegment.create({
        data: {
          id: crypto.randomUUID(),
          recordingId,
          questionIndex: r.index,
          audioPath: r.audioPath,
          duration: r.duration,
          transcript: r.transcript,
          featuresJson: JSON.stringify(r.features),
          semanticArousal: r.semanticArousal,
          acousticArousal: r.acousticArousal,
          contrastRate: r.contrastRate,
          dramaDensity: r.dramaDensity,
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
        contrastRateAvg: contrastAvg,
        contrastRateStd: contrastStd,
        dramaDensityAvg: dramaAvg,
        z1SpeedStability: z1,
        z2VolumeStrength: z2,
        z3MonologueTendency: z3,
        triggeredSignatures: JSON.stringify([]),
        matchedSubsystem,
        matchedPersonaId,
        evidenceJson: JSON.stringify(buildEvidence(readings)),
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
    matchedSubsystem,
    subsystemTitle,
    matchedPersonaId,
    headline,
    cardCopy,
    imageUrl: img.url,
    contrastRateAvg: contrastAvg,
    dramaDensityAvg: dramaAvg,
  };
}

// ============ helpers (all placeholders that Track A will replace) ============

/**
 * Placeholder for the DSP layer's real acoustic-arousal formula (PRD §2.1):
 *   V_ac_arousal = normalize( F0_std·w1 + RMS_dr·w2 + SR·w3 + SR_var·w4 + peak_density·w5 )
 * Track A owns the final weights + normalization. We hardcode a workable
 * approximation using the fields already in `AcousticFeatures` so contrast
 * has real (not zero) inputs pre-VBTI.
 */
function deriveAcousticArousal(f: AcousticFeatures): number {
  // Normalize each contributing feature to [0, 1] using observed ranges from
  // src/lib/scoring/baselines.ts. These are the *legacy* baselines; VBTI's
  // baselines.segment.ts is Track A's TODO.
  const f0StdN = clip01((f.f0Std - 10) / (70 - 10));
  const rmsDrN = clip01(f.rmsDr / 0.4);
  const srN = clip01((f.speechRate - 2.5) / (7 - 2.5));
  const srVarN = clip01(f.speechRateVar / 0.8);
  return 0.35 * f0StdN + 0.30 * rmsDrN + 0.20 * srN + 0.15 * srVarN;
}

/**
 * Placeholder for drama density (PRD §2.2):
 *   drama = normalize( F0_std * 0.35 + RMS_dr * 0.35 + peak_density * 0.30 ) * 100
 * peak_density does not yet exist in AcousticFeatures — Track A adds it.
 * Until then we substitute `pauseCount / duration` as a rough stand-in.
 */
function deriveDramaDensity(f: AcousticFeatures): number {
  const f0StdN = clip01((f.f0Std - 10) / (70 - 10));
  const rmsDrN = clip01(f.rmsDr / 0.4);
  const pseudoPeakDensity = clip01(f.pauseCount / Math.max(1, f.duration));
  return (0.35 * f0StdN + 0.35 * rmsDrN + 0.30 * pseudoPeakDensity) * 100;
}

/**
 * z1/z2/z3 auxiliary axes computed across-segments per PRD §2.3 & §3.2.
 * Aggregation strategy: cross-segment mean of the underlying feature (so
 * per-segment noise averages out), then normalize.
 */
function aggregateAuxiliaryAxes(readings: SegmentReading[]): {
  z1: number;
  z2: number;
  z3: number;
} {
  const srVarMean = mean(readings.map((r) => r.features.speechRateVar));
  const rmsMean = mean(readings.map((r) => r.features.rmsMean));
  const sentLenMean = mean(readings.map((r) => r.features.sentLen));
  const pauseDurMean = mean(readings.map((r) => r.features.pauseDurAvg));
  return {
    z1: (1 - clip01(srVarMean / 0.8)) * 100,
    z2: clip01((rmsMean - 0.05) / (0.28 - 0.05)) * 100,
    // Regular pauses × sentence length → monologue tendency proxy.
    z3: clip01((sentLenMean / 30) * (pauseDurMean / 0.6)) * 100,
  };
}

interface PlaceholderMatchInput {
  contrastAvg: number;
  dramaAvg: number;
  z1: number;
  z2: number;
  z3: number;
  stageDirection?: StageDirection;
}

/**
 * A *placeholder* subsystem matcher. Uses a lookup on which quadrant of the
 * (contrast, drama) plane the user lands in — the 5 canonical VBTI subsystems.
 * Real weights, signature triggers, and persona-level dispatch belong to
 * Track A's `lib/matching/`.
 */
function placeholderMatch(input: PlaceholderMatchInput): {
  matchedSubsystem: string;
  subsystemTitle: string;
  matchedPersonaId: string;
  headline: string;
  cardCopy: string;
} {
  const { contrastAvg, dramaAvg } = input;
  // Cheap 5-way classification — swap for real algorithm when it lands.
  let subsystem = "film";
  let title = "影视组";
  let persona = "steady_decision_maker";
  if (dramaAvg > 65 && contrastAvg < 40) {
    subsystem = "street";
    title = "街头组";
    persona = "cheerleader";
  } else if (dramaAvg > 55) {
    subsystem = "variety";
    title = "综艺组";
    persona = "standup_performer";
  } else if (dramaAvg < 25 && contrastAvg < 25) {
    subsystem = "robot";
    title = "机器人组";
    persona = "calm_narrator";
  } else if (contrastAvg < 30 && dramaAvg < 50 && input.z3 > 60) {
    subsystem = "stage";
    title = "舞台组";
    persona = "poet_reader";
  }

  return {
    matchedSubsystem: subsystem,
    subsystemTitle: title,
    matchedPersonaId: persona,
    headline: `你演的像${title}`,
    cardCopy:
      `反差率 ${Math.round(contrastAvg)}% · 抓马浓度 ${Math.round(dramaAvg)} — ` +
      `声学证据把你钉在了${title}这一档。`,
  };
}

function buildEvidence(readings: SegmentReading[]): Array<{
  question: number;
  transcriptPreview: string;
  contrastRate: number;
  dramaDensity: number;
}> {
  return readings.map((r) => ({
    question: r.index,
    transcriptPreview: r.transcript.slice(0, 20),
    contrastRate: Math.round(r.contrastRate),
    dramaDensity: Math.round(r.dramaDensity),
  }));
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function std(xs: number[]): number {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) ** 2;
  return Math.sqrt(ss / xs.length);
}

function clip01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Small utility for the API route to persist a single incoming Blob to the
 * audio storage directory with a per-segment id. Returns the absolute on-disk
 * path suitable for feeding to `runSegmentedAnalysisPipeline`.
 */
export async function saveSegmentBlob(opts: {
  blob: Blob;
  index: number;
  mimeType: string;
}): Promise<{ absPath: string }> {
  const buf = Buffer.from(await opts.blob.arrayBuffer());
  const id = `${crypto.randomUUID()}-q${opts.index}`;
  const { absPath } = await saveUploadedAudio({
    id,
    mimeType: opts.mimeType,
    data: buf,
  });
  return { absPath };
}

/** Debug helper — dumps a segment reading for tests / demos. */
export function stringifySegmentReading(r: SegmentReading): string {
  return `[q${r.index}] ${r.duration.toFixed(1)}s  sem=${r.semanticArousal.toFixed(2)}  ` +
    `ac=${r.acousticArousal.toFixed(2)}  Δ=${r.contrastRate.toFixed(0)}  drama=${r.dramaDensity.toFixed(0)}  ` +
    `“${r.transcript.slice(0, 24)}…”`;
}

// re-exports so smoke tests can inspect internals without duplicating imports
export { deriveAcousticArousal, deriveDramaDensity };
// silence unused-import if fs/path get pruned in a future edit
void fs;
void path;
