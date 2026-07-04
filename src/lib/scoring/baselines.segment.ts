// Short-segment baselines for VBTI's 10-14s question clips.
// Kept separate from baselines.ts, whose ranges target 30-60s clips.

import type { AcousticFeatures } from "@/types/core";
import type { Range } from "./baselines";

export const SEGMENT_BASELINES: Record<keyof AcousticFeatures, Range> = {
  duration: { min: 8, max: 16 },
  speechRate: { min: 2.5, max: 7 },
  speechRateVar: { min: 0, max: 1.2 },
  pauseCount: { min: 0, max: 8 },
  pauseDurAvg: { min: 0.1, max: 0.8 },
  pauseRatio: { min: 0, max: 0.45 },
  f0Mean: { min: 90, max: 260 },
  f0Std: { min: 8, max: 70 },
  f0Range: { min: 30, max: 220 },
  rmsMean: { min: 0.04, max: 0.3 },
  rmsDr: { min: 0.05, max: 0.65 },
  pitchSlopeEnd: { min: -45, max: 45 },
  fillerRate: { min: 0, max: 24 },
  ttr: { min: 0.45, max: 1 },
  sentLen: { min: 4, max: 28 },
  peakDensity: { min: 0, max: 6 },
  pauseRegularity: { min: 0, max: 1 },
  burstStops: { min: 0, max: 8 },
};
