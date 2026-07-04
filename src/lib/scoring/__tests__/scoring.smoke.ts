// Smoke test for the six-dimension scorer + role matcher.
// Run: npx tsx src/lib/scoring/__tests__/scoring.smoke.ts
//
// Builds three synthetic AcousticFeatures fixtures matching PRD archetypes,
// prints the scored dimensions and top-3 matched roles, and asserts each
// fixture lands in the expected role family. Logs MATCH-PASS / MATCH-FAIL
// without throwing so the pipeline can be inspected end-to-end.

import type { AcousticFeatures, Dimension } from "@/types/core";
import { scoreDimensions } from "@/lib/scoring/dimensions";
import { matchRole } from "@/lib/roles/match";

interface Fixture {
  name: string;
  features: AcousticFeatures;
  expectedRoleIds: string[]; // any of these in top-3 = pass
}

const fixtures: Fixture[] = [
  {
    name: "(a) fast talker",
    features: {
      duration: 45,
      speechRate: 6.5,
      speechRateVar: 0.6,
      pauseCount: 3,
      pauseDurAvg: 0.2,
      pauseRatio: 0.05,
      f0Mean: 220,
      f0Std: 65,
      f0Range: 200,
      rmsMean: 0.19,
      rmsDr: 0.55,
      pitchSlopeEnd: -8,
      fillerRate: 4,
      ttr: 0.55,
      sentLen: 14,
      peakDensity: 4.2,
      pauseRegularity: 0.35,
      burstStops: 5,
    },
    expectedRoleIds: ["rapid_lecturer", "standup_performer", "cheerleader"],
  },
  {
    name: "(b) slow radio host",
    features: {
      duration: 60,
      speechRate: 3.2,
      speechRateVar: 0.15,
      pauseCount: 14,
      pauseDurAvg: 0.6,
      pauseRatio: 0.32,
      f0Mean: 115,
      f0Std: 14,
      f0Range: 55,
      rmsMean: 0.09,
      rmsDr: 0.18,
      pitchSlopeEnd: -18,
      fillerRate: 2,
      ttr: 0.6,
      sentLen: 18,
      peakDensity: 0.8,
      pauseRegularity: 0.85,
      burstStops: 1,
    },
    expectedRoleIds: ["late_night_radio_host", "gentle_hollow", "calm_narrator", "deep_philosopher"],
  },
  {
    name: "(c) curious asker",
    features: {
      duration: 50,
      speechRate: 4.8,
      speechRateVar: 0.8,
      pauseCount: 8,
      pauseDurAvg: 0.3,
      pauseRatio: 0.15,
      f0Mean: 210,
      f0Std: 50,
      f0Range: 160,
      rmsMean: 0.15,
      rmsDr: 0.4,
      pitchSlopeEnd: 28,
      fillerRate: 12,
      ttr: 0.45,
      sentLen: 10,
      peakDensity: 2.6,
      pauseRegularity: 0.45,
      burstStops: 3,
    },
    expectedRoleIds: ["curious_asker", "neighbor_chatter"],
  },
];

function printDims(dims: Dimension[]): void {
  for (const d of dims) {
    console.log(
      `  - ${d.key.padEnd(26)} score=${String(d.score).padStart(3)}  ${d.levelLabel.padEnd(6)}  · ${d.evidenceMetric}`,
    );
  }
}

let allPass = true;

for (const fx of fixtures) {
  console.log("");
  console.log(`=== ${fx.name} ===`);
  const dims = scoreDimensions(fx.features);
  printDims(dims);

  const { role, distance, topN } = matchRole(dims);
  console.log(`  matched: ${role.title} (${role.id})  distance=${distance.toFixed(3)}`);
  console.log("  top-3:");
  for (const r of topN) {
    console.log(`    · ${r.title.padEnd(12)}  (${r.id})`);
  }

  const topIds = topN.map((r) => r.id);
  const hit = fx.expectedRoleIds.some((id) => topIds.includes(id));
  if (hit) {
    console.log(`  MATCH-PASS  (expected one of: ${fx.expectedRoleIds.join(", ")})`);
  } else {
    allPass = false;
    console.log(`  MATCH-FAIL  (expected one of: ${fx.expectedRoleIds.join(", ")}, got: ${topIds.join(", ")})`);
  }
}

console.log("");
console.log(allPass ? "ALL FIXTURES: MATCH-PASS" : "SOME FIXTURES: MATCH-FAIL");
