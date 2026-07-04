// Smoke test for VBTI contrast/drama scoring.
// Run: npx tsx src/lib/scoring/__tests__/vbti.smoke.ts

import type { AcousticFeatures } from "@/types/core";
import {
  aggregateVbtiVector,
  computeContrastResult,
  deriveAcousticArousal,
  deriveDramaDensity,
} from "@/lib/scoring/vbti";

function base(overrides: Partial<AcousticFeatures>): AcousticFeatures {
  return {
    duration: 12,
    speechRate: 4,
    speechRateVar: 0.3,
    pauseCount: 3,
    pauseDurAvg: 0.25,
    pauseRatio: 0.15,
    f0Mean: 180,
    f0Std: 25,
    f0Range: 90,
    rmsMean: 0.14,
    rmsDr: 0.2,
    pitchSlopeEnd: 0,
    fillerRate: 2,
    ttr: 0.5,
    sentLen: 12,
    peakDensity: 1,
    pauseRegularity: 0.5,
    burstStops: 1,
    ...overrides,
  };
}

const calm = base({ f0Std: 12, rmsDr: 0.1, speechRate: 3, speechRateVar: 0.1, peakDensity: 0.2 });
const dramatic = base({ f0Std: 70, rmsDr: 0.65, speechRate: 6.5, speechRateVar: 1, peakDensity: 5 });

const calmArousal = deriveAcousticArousal(calm);
const dramaticArousal = deriveAcousticArousal(dramatic);
if (!(dramaticArousal > calmArousal)) {
  throw new Error(`dramatic acoustic arousal should be higher: calm=${calmArousal}, dramatic=${dramaticArousal}`);
}

const calmDrama = deriveDramaDensity(calm);
const dramaticDrama = deriveDramaDensity(dramatic);
if (!(dramaticDrama > calmDrama + 40)) {
  throw new Error(`dramatic density should be much higher: calm=${calmDrama}, dramatic=${dramaticDrama}`);
}

const contrast = computeContrastResult([
  { questionIndex: 1, features: calm, semanticArousal: 0.95 },
  { questionIndex: 2, features: dramatic, semanticArousal: 0.2 },
]);
if (contrast.contrastRateAvg < 40) {
  throw new Error(`contrastRateAvg should reflect arousal mismatch, got ${contrast.contrastRateAvg}`);
}
if (contrast.dramaDensityAvg <= 0) {
  throw new Error(`dramaDensityAvg should be positive, got ${contrast.dramaDensityAvg}`);
}

const vector = aggregateVbtiVector([
  { questionIndex: 1, features: base({ speechRateVar: 0.05, pauseRegularity: 0.9, sentLen: 24 }), semanticArousal: 0.2 },
  { questionIndex: 2, features: base({ speechRateVar: 0.05, pauseRegularity: 0.9, sentLen: 24 }), semanticArousal: 0.25 },
]);
if (vector.z1 < 80) throw new Error(`z1 should be high for stable speech rate, got ${vector.z1}`);
if (vector.z3 < 50) throw new Error(`z3 should rise with long sentences and regular pauses, got ${vector.z3}`);

console.log("VBTI SCORING SMOKE: OK");
