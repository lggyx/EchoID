// Smoke test for VBTI-specific frame features.
// Run: npx tsx src/lib/features/__tests__/vbti-features.smoke.ts

import { computeVbtiFrameFeatures } from "@/lib/features/vbti";
import type { Segment } from "@/lib/features/vad";

function approx(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
  }
}

const sampleRate = 16_000;
const duration = 4;

// Three obvious local energy peaks over a 4s toy sequence.
const rms = new Float32Array([0.02, 0.2, 0.04, 0.22, 0.03, 0.21, 0.02, 0.19]);
const f0 = new Float32Array([0, 180, 150, 210, 0, 205, 160, 190]);
const voiced = new Uint8Array([0, 1, 1, 1, 0, 1, 1, 1]);

// Equally spaced pauses: starts at 0.8, 1.8, 2.8 => interval CV 0.
const pauses: Segment[] = [
  { start: 0.8, end: 1.0, startFrame: 80, endFrame: 100 },
  { start: 1.8, end: 2.0, startFrame: 180, endFrame: 200 },
  { start: 2.8, end: 3.0, startFrame: 280, endFrame: 300 },
];

const speech: Segment[] = [
  { start: 0.0, end: 0.8, startFrame: 0, endFrame: 80 },
  { start: 1.0, end: 1.8, startFrame: 100, endFrame: 180 },
  { start: 2.0, end: 2.8, startFrame: 200, endFrame: 280 },
  { start: 3.0, end: 4.0, startFrame: 300, endFrame: 400 },
];

const features = computeVbtiFrameFeatures({
  rms,
  f0,
  voiced,
  pauses,
  speech,
  duration,
  sampleRate,
});

if (features.peakDensity <= 0) {
  throw new Error(`peakDensity should be positive, got ${features.peakDensity}`);
}
approx(features.pauseRegularity, 1, 0.01, "regular pauses");
if (features.burstStops < 3) {
  throw new Error(`burstStops should count speech-pause-speech transitions, got ${features.burstStops}`);
}

console.log("VBTI FEATURE SMOKE: OK");
