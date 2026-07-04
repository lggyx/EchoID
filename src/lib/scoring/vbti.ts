import type { AcousticFeatures, ContrastResult, EvidenceItem, VbtiVector } from "@/types/core";
import { norm } from "./baselines";
import { SEGMENT_BASELINES } from "./baselines.segment";

export interface VbtiSegmentScoringInput {
  questionIndex: number;
  features: AcousticFeatures;
  semanticArousal: number;
  transcript?: string;
}

export interface VbtiSegmentScore {
  questionIndex: number;
  features: AcousticFeatures;
  semanticArousal: number;
  acousticArousal: number;
  contrastRate: number;
  dramaDensity: number;
  transcript?: string;
}

export function deriveAcousticArousal(features: AcousticFeatures): number {
  const f0Std = norm(features.f0Std, SEGMENT_BASELINES.f0Std);
  const rmsDr = norm(features.rmsDr, SEGMENT_BASELINES.rmsDr);
  const speechRate = norm(features.speechRate, SEGMENT_BASELINES.speechRate);
  const speechRateVar = norm(features.speechRateVar, SEGMENT_BASELINES.speechRateVar);
  const peakDensity = norm(features.peakDensity, SEGMENT_BASELINES.peakDensity);
  return clip01(
    f0Std * 0.3 +
      rmsDr * 0.25 +
      speechRate * 0.15 +
      speechRateVar * 0.1 +
      peakDensity * 0.2,
  );
}

export function deriveDramaDensity(features: AcousticFeatures): number {
  const f0Std = norm(features.f0Std, SEGMENT_BASELINES.f0Std);
  const rmsDr = norm(features.rmsDr, SEGMENT_BASELINES.rmsDr);
  const peakDensity = norm(features.peakDensity, SEGMENT_BASELINES.peakDensity);
  return clip100((f0Std * 0.35 + rmsDr * 0.35 + peakDensity * 0.3) * 100);
}

export function scoreVbtiSegment(input: VbtiSegmentScoringInput): VbtiSegmentScore {
  const semanticArousal = clip01(input.semanticArousal);
  const acousticArousal = deriveAcousticArousal(input.features);
  return {
    ...input,
    semanticArousal,
    acousticArousal,
    contrastRate: Math.abs(semanticArousal - acousticArousal) * 100,
    dramaDensity: deriveDramaDensity(input.features),
  };
}

export function computeContrastResult(inputs: VbtiSegmentScoringInput[]): ContrastResult {
  const segments = inputs.map(scoreVbtiSegment);
  const vector = aggregateVbtiVector(inputs);
  const contrasts = segments.map((s) => s.contrastRate);
  const dramas = segments.map((s) => s.dramaDensity);
  const semantic = mean(segments.map((s) => s.semanticArousal));
  const acoustic = mean(segments.map((s) => s.acousticArousal));
  const contrastRateAvg = mean(contrasts);
  const dramaDensityAvg = mean(dramas);

  return {
    ...vector,
    contrast: contrastRateAvg,
    drama: dramaDensityAvg,
    contrastRateAvg,
    contrastRateStd: std(contrasts),
    dramaDensityAvg,
    dramaDensityStd: std(dramas),
    semanticArousal: semantic,
    acousticArousal: acoustic,
    triggered: [],
    evidence: buildEvidence(segments),
  };
}

export function aggregateVbtiVector(inputs: VbtiSegmentScoringInput[]): VbtiVector {
  const segments = inputs.map(scoreVbtiSegment);
  const features = segments.map((s) => s.features);
  const contrast = mean(segments.map((s) => s.contrastRate));
  const drama = mean(segments.map((s) => s.dramaDensity));
  const speechRateVar = mean(features.map((f) => f.speechRateVar));
  const rmsMean = mean(features.map((f) => f.rmsMean));
  const sentLen = mean(features.map((f) => f.sentLen));
  const pauseRegularity = mean(features.map((f) => f.pauseRegularity));

  return {
    contrast: clip100(contrast),
    drama: clip100(drama),
    z1: clip100((1 - norm(speechRateVar, SEGMENT_BASELINES.speechRateVar)) * 100),
    z2: clip100(norm(rmsMean, SEGMENT_BASELINES.rmsMean) * 100),
    z3: clip100((norm(sentLen, SEGMENT_BASELINES.sentLen) * 0.65 + pauseRegularity * 0.35) * 100),
  };
}

function buildEvidence(segments: VbtiSegmentScore[]): EvidenceItem[] {
  return segments.map((segment) => ({
    key: "segment_contrast",
    label: `第 ${segment.questionIndex} 题反差`,
    value: Math.round(segment.contrastRate),
    unit: "%",
    segmentIndex: segment.questionIndex,
    text: `语义激动度 ${segment.semanticArousal.toFixed(2)}，声学激动度 ${segment.acousticArousal.toFixed(2)}`,
  }));
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length);
}

function clip01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function clip100(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}
