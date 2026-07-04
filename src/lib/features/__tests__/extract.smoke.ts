/**
 * Smoke test for the acoustic feature pipeline. NOT a real test framework;
 * run with:  npx tsx src/lib/features/__tests__/extract.smoke.ts
 *
 * It:
 *   1. Generates a 20-second, 220 Hz sine wave WAV via `wavefile`.
 *   2. Runs extractAcousticFeatures with a mock ASR transcript.
 *   3. Prints all 14 features.
 *   4. Asserts a handful of ballpark invariants.
 */

import { writeFileSync } from "node:fs";
import { WaveFile } from "wavefile";
import { extractAcousticFeatures } from "../extract";
import { MockASRProvider } from "@/lib/providers/asr-mock";

const SINE_PATH = "/tmp/echoid_sine.wav";
const SR = 16000;
const DUR_SEC = 20;
const FREQ = 220;
const AMPLITUDE = 0.6;

function generateSineWav(path: string): void {
  const N = SR * DUR_SEC;
  const samples = new Int16Array(N);
  const twoPiF = 2 * Math.PI * FREQ;
  for (let i = 0; i < N; i++) {
    const s = AMPLITUDE * Math.sin((twoPiF * i) / SR);
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
  }
  const wav = new WaveFile();
  wav.fromScratch(1, SR, "16", samples);
  writeFileSync(path, Buffer.from(wav.toBuffer()));
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("  ASSERT FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("  ok:", msg);
  }
}

async function main(): Promise<void> {
  console.log("[1/3] generating sine wav →", SINE_PATH);
  generateSineWav(SINE_PATH);

  console.log("[2/3] running mock ASR + feature extractor...");
  const asr = await new MockASRProvider().transcribe({ path: SINE_PATH, mimeType: "audio/wav" });
  const feats = await extractAcousticFeatures({
    audioPath: SINE_PATH,
    mimeType: "audio/wav",
    asrResult: asr,
  });

  console.log("[3/3] features:");
  for (const [k, v] of Object.entries(feats)) {
    const num = typeof v === "number" ? Number(v.toFixed(4)) : v;
    console.log(`  ${k.padEnd(16)} = ${num}`);
  }

  console.log("assertions:");
  assert(Math.abs(feats.duration - 20) < 0.05, `duration ≈ 20 (got ${feats.duration.toFixed(3)})`);
  assert(feats.f0Mean > 200 && feats.f0Mean < 240, `f0Mean in (200,240) (got ${feats.f0Mean.toFixed(2)})`);
  assert(feats.rmsMean > 0, `rmsMean > 0 (got ${feats.rmsMean.toFixed(4)})`);
  assert(feats.pauseRatio < 0.05, `pauseRatio < 0.05 (got ${feats.pauseRatio.toFixed(4)})`);
  assert(Number.isFinite((feats as any).peakDensity), `peakDensity is finite (got ${(feats as any).peakDensity})`);
  assert(
    (feats as any).pauseRegularity >= 0 && (feats as any).pauseRegularity <= 1,
    `pauseRegularity in [0,1] (got ${(feats as any).pauseRegularity})`,
  );
  assert(Number.isFinite((feats as any).burstStops), `burstStops is finite (got ${(feats as any).burstStops})`);

  console.log(process.exitCode ? "SMOKE: FAIL" : "SMOKE: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
