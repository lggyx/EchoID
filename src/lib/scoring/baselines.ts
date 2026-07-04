// Reference min/max ranges for each acoustic feature.
// Values are calibrated against typical Chinese conversational-speech norms
// (adult native speakers, ~30–60s clips). Used to linearly clip raw features
// to a 0..1 normalized scale before combining into dimension scores.
//
// If a raw feature falls outside [min,max] it is clamped. The direction of
// "higher = more" is handled in dimensions.ts (some contributions are inverted).

import type { AcousticFeatures } from "@/types/core";

export interface Range {
  min: number;
  max: number;
}

export const BASELINES: Record<keyof AcousticFeatures, Range> = {
  // Total duration doesn't feed dimensions directly; kept for completeness.
  duration: { min: 0, max: 120 },
  // 慢 ~2.5 字/秒 (radio host), 快 ~7 字/秒 (rapid lecturer). 4–5 is average.
  speechRate: { min: 2.5, max: 7 },
  // Segment-level speed variance; 0 = metronome, 1.5+ = highly bursty.
  speechRateVar: { min: 0, max: 1.8 },
  // Silent pauses per clip (~30s reference). Very few → confident/rapid.
  pauseCount: { min: 0, max: 20 },
  // Average pause duration; >0.4s counts as "thoughtful".
  pauseDurAvg: { min: 0.1, max: 1.0 },
  // Fraction of clip that is silence.
  pauseRatio: { min: 0, max: 0.5 },
  // Chinese F0 span: male ~90Hz, female ~230Hz, expressive ~260Hz+.
  f0Mean: { min: 90, max: 260 },
  // Pitch variability; monotone ~10Hz, animated ~70Hz+.
  f0Std: { min: 10, max: 70 },
  f0Range: { min: 40, max: 220 },
  // Loudness in normalized 0..1 space.
  rmsMean: { min: 0.05, max: 0.28 },
  rmsDr: { min: 0.1, max: 0.7 },
  // Signed end-of-sentence pitch slope (Hz/s). Positive = rising (question),
  // negative = falling (statement). Symmetric clip.
  pitchSlopeEnd: { min: -40, max: 40 },
  // Filler words per minute. 0 = disciplined, 15+ = colloquial.
  fillerRate: { min: 0, max: 18 },
  // Lexical richness (type-token ratio).
  ttr: { min: 0.3, max: 0.75 },
  // Average sentence length in Chinese characters.
  sentLen: { min: 6, max: 24 },
};

/** Linearly normalize `value` into [0,1] using `range`, clamping outside. */
export function norm(value: number, range: Range): number {
  const { min, max } = range;
  if (max <= min) return 0;
  const v = (value - min) / (max - min);
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Normalize the absolute value against a symmetric ±max range. */
export function normAbs(value: number, range: Range): number {
  const bound = Math.max(Math.abs(range.min), Math.abs(range.max));
  if (bound === 0) return 0;
  const v = Math.abs(value) / bound;
  return v > 1 ? 1 : v;
}

/** Signed slope → 0..1 where 1 = strongly falling (negative). */
export function normFalling(value: number, range: Range): number {
  // Map [+max .. -max] → [0 .. 1].
  const bound = Math.max(Math.abs(range.min), Math.abs(range.max));
  if (bound === 0) return 0.5;
  const v = ( -value + bound) / (2 * bound);
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Signed slope → 0..1 where 1 = strongly rising (positive). */
export function normRising(value: number, range: Range): number {
  const bound = Math.max(Math.abs(range.min), Math.abs(range.max));
  if (bound === 0) return 0.5;
  const v = (value + bound) / (2 * bound);
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
