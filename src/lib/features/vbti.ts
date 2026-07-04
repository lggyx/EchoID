import { HOP_SIZE } from "./rms";
import type { Segment } from "./vad";

export interface VbtiFrameFeatureInput {
  rms: Float32Array;
  f0: Float32Array;
  voiced: Uint8Array;
  pauses: Segment[];
  speech: Segment[];
  duration: number;
  sampleRate: number;
}

export interface VbtiFrameFeatures {
  /** Debounced local extrema count per second across energy and pitch. */
  peakDensity: number;
  /** Pause-interval regularity in [0,1], where 1 means metronomic. */
  pauseRegularity: number;
  /** Count of high -> quiet -> high transitions with speech on both sides. */
  burstStops: number;
}

export function computeVbtiFrameFeatures(input: VbtiFrameFeatureInput): VbtiFrameFeatures {
  const duration = Math.max(0, input.duration);
  const minDistanceFrames = Math.max(1, Math.round((0.12 * input.sampleRate) / HOP_SIZE));
  const rmsPeaks = collectLocalPeaks(input.rms, undefined, minDistanceFrames);
  const f0Peaks = collectLocalPeaks(input.f0, input.voiced, minDistanceFrames);
  const peakCount = mergeNearbyFrames([...rmsPeaks, ...f0Peaks].sort((a, b) => a - b), minDistanceFrames).length;

  return {
    peakDensity: duration > 0 ? peakCount / duration : 0,
    pauseRegularity: computePauseRegularity(input.pauses),
    burstStops: countBurstStops(input.pauses, input.speech),
  };
}

function collectLocalPeaks(
  values: Float32Array,
  active: Uint8Array | undefined,
  minDistanceFrames: number,
): number[] {
  if (values.length < 3) return [];
  const threshold = adaptivePeakThreshold(values, active);
  const peaks: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < values.length - 1; i++) {
    if (active && !active[i]) continue;
    const v = values[i];
    if (v < threshold) continue;
    if (v >= values[i - 1] && v > values[i + 1] && i - last >= minDistanceFrames) {
      peaks.push(i);
      last = i;
    }
  }
  return peaks;
}

function adaptivePeakThreshold(values: Float32Array, active?: Uint8Array): number {
  const pool: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (active && !active[i]) continue;
    const v = values[i];
    if (Number.isFinite(v) && v > 0) pool.push(v);
  }
  if (pool.length === 0) return Number.POSITIVE_INFINITY;
  pool.sort((a, b) => a - b);
  const median = percentile(pool, 0.5);
  const p90 = percentile(pool, 0.9);
  return median + (p90 - median) * 0.25;
}

function mergeNearbyFrames(frames: number[], minDistanceFrames: number): number[] {
  const merged: number[] = [];
  for (const frame of frames) {
    const prev = merged[merged.length - 1];
    if (prev === undefined || frame - prev >= minDistanceFrames) {
      merged.push(frame);
    }
  }
  return merged;
}

function computePauseRegularity(pauses: Segment[]): number {
  if (pauses.length < 3) return 0.5;
  const intervals: number[] = [];
  for (let i = 1; i < pauses.length; i++) {
    intervals.push(pauses[i].start - pauses[i - 1].start);
  }
  const m = mean(intervals);
  if (m <= 1e-6) return 0;
  return clip01(1 - std(intervals) / m);
}

function countBurstStops(pauses: Segment[], speech: Segment[]): number {
  let count = 0;
  for (const pause of pauses) {
    const hasSpeechBefore = speech.some((s) => s.end <= pause.start && pause.start - s.end <= 0.4);
    const hasSpeechAfter = speech.some((s) => s.start >= pause.end && s.start - pause.end <= 0.4);
    if (hasSpeechBefore && hasSpeechAfter) count++;
  }
  return count;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
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
