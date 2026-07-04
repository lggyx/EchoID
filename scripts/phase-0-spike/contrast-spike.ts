/**
 * PRD-VBTI-v1.1 §7 · Phase 0 — Contrast Rate Feasibility Spike.
 *
 * Existence question: does |V_sem_arousal - V_ac_arousal| actually carry
 * signal, or is it noise? If it's noise, VBTI's whole product bet collapses
 * and we retreat to the "drama density only" fallback (PRD §9 R0).
 *
 * Pass criteria (PRD §11):
 *   1. Distribution spread across ~8-10 clips: max(contrast) - min(contrast) > 40
 *   2. Intra-clip stability: same clip, run 3x → std(contrast) < 5
 *
 * What we do:
 *   - Read pre-recorded clips from Phase0AudioSpec/ (or PHASE0_AUDIO_DIR env).
 *   - For each clip:
 *       a) ASR via the running faster-whisper sidecar.
 *       b) Semantic arousal via the real LLM (OpenAI-compatible).
 *          Fallback to keywordArousal if the LLM 404s / times out.
 *       c) Acoustic arousal from the 14-feature extractor via a small
 *          weighted normalization (§2.1 formula, approximated with what
 *          `extract.ts` already produces; peak_density lands in Phase 2).
 *       d) Contrast = |sem - ac| * 100.
 *       e) Rerun (b)+(c)+(d) 3x total to measure stability.
 *   - Report: table of clips with (transcript preview, sem, ac, contrast,
 *     std), plus overall PASS/FAIL against the two criteria and a written
 *     conclusion block that goes into docs/phase-0-conclusion.md.
 *
 * How to run (inside the dev container, real LLM key in .env):
 *   container exec echoid-dev bash -lc \
 *     "cd /app && npx tsx --env-file=.env scripts/phase-0-spike/contrast-spike.ts"
 *
 * Or set PHASE0_AUDIO_DIR=/some/path and point at existing WAV files.
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

import type { AcousticFeatures } from "@/types/core";

import { extractAcousticFeatures } from "@/lib/features/extract";
import { getASRProvider, getLLMProvider } from "@/lib/providers";
import { keywordArousal } from "@/lib/providers/arousal-fallback";

// ============================================================================
// clip metadata
// ============================================================================

/**
 * The 8 clips that cover the contrast space:
 *   - HH: high-semantic + high-acoustic  (rage matches voice)
 *   - LL: low-semantic  + low-acoustic   (deadpan matches voice)
 *   - HL: high-semantic + low-acoustic   (venting content, monotone voice)
 *   - LH: low-semantic  + high-acoustic  (calm content, dramatic voice)
 *   - one purely descriptive baseline
 *
 * The `expected` field is a rough guide for the human reviewer, not an
 * assertion — we're measuring what actually shows up.
 */
interface ClipSpec {
  id: string;
  file: string;
  text: string;
  expected: "HH" | "LL" | "HL" | "LH" | "mid";
}

const CLIPS: ClipSpec[] = [
  {
    id: "01_flat_shrug",
    file: "01_flat_shrug.wav",
    text: "还行吧就那样也没什么特别的感觉一般般",
    expected: "LL",
  },
  {
    id: "02_meltdown_rage",
    file: "02_meltdown_rage.wav",
    text: "主角死了我要杀了编剧真的绝了气死我了这什么破结局",
    expected: "HH",
  },
  {
    id: "03_flat_calm_vent",
    file: "03_flat_calm_vent.wav",
    text: "我觉得这次真的是特别过分特别不能接受的一件事情",
    expected: "HL",
  },
  {
    id: "04_excited_boring",
    file: "04_excited_boring.wav",
    text: "今天午饭吃了番茄鸡蛋盖饭还挺好吃的价格也合适",
    expected: "LH",
  },
  {
    id: "05_baseline_report",
    file: "05_baseline_report.wav",
    text: "本季度的营收环比增长百分之八利润率保持稳定",
    expected: "mid",
  },
  {
    id: "06_restrained_anger",
    file: "06_restrained_anger.wav",
    text: "这块其实不是我负责的这个方案我完全没参与",
    expected: "HL",
  },
  {
    id: "07_happy_uneventful",
    file: "07_happy_uneventful.wav",
    text: "周末去了公园散步天气特别好心情也不错",
    expected: "mid",
  },
  {
    id: "08_ecstatic_praise",
    file: "08_ecstatic_praise.wav",
    text: "这个产品简直太好用了我要疯了强推所有人都得试试",
    expected: "HH",
  },
];

const AUDIO_DIR = process.env.PHASE0_AUDIO_DIR ?? "./scripts/phase-0-spike/audio";
const REPEATS = 3;
const PRD_SPREAD_THRESHOLD = 40;
const CONTINUE_SPREAD_THRESHOLD = Number(process.env.PHASE0_CONTINUE_SPREAD_THRESHOLD ?? 20);

// ============================================================================
// spike core
// ============================================================================

/**
 * Placeholder acoustic-arousal formula. Matches the one used by Track C's
 * pipeline-segmented.ts so Phase 0 measures the same signal the runtime uses.
 * Track A will replace this with the peak_density-aware version in Phase 2.
 */
function deriveAcousticArousal(f: AcousticFeatures): number {
  const clip01 = (x: number) => (!Number.isFinite(x) ? 0 : Math.min(1, Math.max(0, x)));
  const f0StdN = clip01((f.f0Std - 10) / (70 - 10));
  const rmsDrN = clip01(f.rmsDr / 0.4);
  const srN = clip01((f.speechRate - 2.5) / (7 - 2.5));
  const srVarN = clip01(f.speechRateVar / 0.8);
  return 0.35 * f0StdN + 0.30 * rmsDrN + 0.20 * srN + 0.15 * srVarN;
}

interface OneRun {
  transcript: string;
  sem: number;
  ac: number;
  contrast: number;
  llmFallback: boolean;
}

async function runOnce(audioPath: string): Promise<OneRun> {
  const asr = getASRProvider();
  const llm = getLLMProvider();

  const asrResult = await asr.transcribe({ path: audioPath, mimeType: "audio/wav" });
  const features = await extractAcousticFeatures({
    audioPath, mimeType: "audio/wav", asrResult,
  });

  let sem = 0.5;
  let fallback = false;
  try {
    const r = await llm.extractArousal({ transcript: asrResult.text });
    sem = r.arousal;
  } catch (err) {
    // Never let a single LLM failure kill the spike; fall back to keywords.
    const kw = keywordArousal({ transcript: asrResult.text });
    sem = kw.arousal;
    fallback = true;
    console.warn(`  ! LLM failed, keyword fallback: ${(err as Error).message.slice(0, 120)}`);
  }
  const ac = deriveAcousticArousal(features);
  return {
    transcript: asrResult.text,
    sem,
    ac,
    contrast: Math.abs(sem - ac) * 100,
    llmFallback: fallback,
  };
}

// ============================================================================
// stats + reporting
// ============================================================================

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}
function std(xs: number[]): number {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.map((x) => (x - m) ** 2).reduce((a, b) => a + b, 0) / xs.length);
}

async function main() {
  console.log("=== PRD §7 · Phase 0 · Contrast-Rate Feasibility Spike ===\n");
  console.log(`audio dir : ${path.resolve(AUDIO_DIR)}`);
  console.log(`repeats   : ${REPEATS} per clip (for intra-clip stability)`);
  console.log(`clips     : ${CLIPS.length}\n`);

  const missing: string[] = [];
  for (const c of CLIPS) {
    const abs = path.join(AUDIO_DIR, c.file);
    if (!existsSync(abs)) missing.push(abs);
  }
  if (missing.length > 0) {
    console.error("Missing audio files:");
    missing.forEach((m) => console.error(`  ${m}`));
    console.error(
      "\nGenerate with scripts/phase-0-spike/generate-audio.sh (uses macOS `say`).",
    );
    process.exit(2);
  }

  interface ClipResult {
    spec: ClipSpec;
    runs: OneRun[];
    contrastMean: number;
    contrastStd: number;
    semMean: number;
    acMean: number;
    transcript: string;
    fallbackAny: boolean;
  }

  const results: ClipResult[] = [];
  for (const spec of CLIPS) {
    console.log(`[${spec.id}] (${spec.expected})`);
    const runs: OneRun[] = [];
    for (let i = 0; i < REPEATS; i++) {
      const t0 = Date.now();
      const r = await runOnce(path.join(AUDIO_DIR, spec.file));
      const dt = Date.now() - t0;
      runs.push(r);
      console.log(
        `  run ${i + 1}/${REPEATS}: sem=${r.sem.toFixed(2)}  ac=${r.ac.toFixed(2)}  ` +
          `Δ=${r.contrast.toFixed(1)}  t=${dt}ms  ${r.llmFallback ? "[kw-fallback]" : ""}`,
      );
    }
    const contrasts = runs.map((r) => r.contrast);
    results.push({
      spec,
      runs,
      contrastMean: mean(contrasts),
      contrastStd: std(contrasts),
      semMean: mean(runs.map((r) => r.sem)),
      acMean: mean(runs.map((r) => r.ac)),
      transcript: runs[0].transcript,
      fallbackAny: runs.some((r) => r.llmFallback),
    });
  }

  console.log("\n=== summary ===\n");
  console.log(
    "clip                       | expect | sem   | ac    | Δmean | Δstd  | ok? | transcript",
  );
  console.log(
    "---------------------------|--------|-------|-------|-------|-------|-----|-----------",
  );
  for (const r of results) {
    const stab = r.contrastStd < 5 ? "✓" : "✗";
    console.log(
      `${r.spec.id.padEnd(26)} | ${r.spec.expected.padEnd(6)} | ` +
        `${r.semMean.toFixed(2)}  | ${r.acMean.toFixed(2)}  | ` +
        `${r.contrastMean.toFixed(1).padStart(5)} | ${r.contrastStd.toFixed(1).padStart(5)} | ` +
        `${stab.padEnd(3)} | ${r.transcript.slice(0, 32)}${r.transcript.length > 32 ? "…" : ""}`,
    );
  }

  const allContrasts = results.map((r) => r.contrastMean);
  const spread = Math.max(...allContrasts) - Math.min(...allContrasts);
  const worstStd = Math.max(...results.map((r) => r.contrastStd));
  const meanStd = mean(results.map((r) => r.contrastStd));
  const fallbacks = results.filter((r) => r.fallbackAny).length;

  console.log("\n=== verdict ===");
  console.log(`spread of Δ means  = ${spread.toFixed(1)}   (PRD need > ${PRD_SPREAD_THRESHOLD})`);
  console.log(`C decision floor   = ${CONTINUE_SPREAD_THRESHOLD.toFixed(1)}   (TTS continuation threshold)`);
  console.log(`worst clip Δ std   = ${worstStd.toFixed(2)}  (need < 5)`);
  console.log(`mean  clip Δ std   = ${meanStd.toFixed(2)}`);
  if (fallbacks > 0) {
    console.log(`⚠ ${fallbacks}/${results.length} clips used keyword fallback for sem`);
  }

  const passSpread = spread > PRD_SPREAD_THRESHOLD;
  const passStability = worstStd < 5;
  const pass = passSpread && passStability;
  const continueByDecisionC = !pass && spread >= CONTINUE_SPREAD_THRESHOLD && passStability;
  console.log(
    `\nRESULT: ${
      pass ? "PASS ✓" : continueByDecisionC ? "CONTINUE BY DECISION C ⚠" : "FAIL ✗"
    } (spread ${passSpread ? "OK" : "PRD FAIL"}, stability ${passStability ? "OK" : "FAIL"})`,
  );

  // Write a machine + human-readable summary. Track A commits this file
  // alongside the code so the whole team can see the Phase 0 result.
  const md = renderMarkdownReport({
    results,
    spread,
    worstStd,
    meanStd,
    pass,
    continueByDecisionC,
    passSpread,
    passStability,
    fallbacks,
  });
  const outPath = "./docs/phase-0-conclusion.md";
  await fs.writeFile(outPath, md, "utf8");
  console.log(`\nwrote ${outPath}`);

  process.exit(pass || continueByDecisionC ? 0 : 1);
}

function renderMarkdownReport(x: {
  results: Array<{
    spec: ClipSpec; runs: OneRun[];
    contrastMean: number; contrastStd: number;
    semMean: number; acMean: number;
    transcript: string; fallbackAny: boolean;
  }>;
  spread: number;
  worstStd: number;
  meanStd: number;
  pass: boolean;
  continueByDecisionC: boolean;
  passSpread: boolean;
  passStability: boolean;
  fallbacks: number;
}): string {
  const now = new Date().toISOString();
  const rows = x.results.map((r) =>
    `| ${r.spec.id} | ${r.spec.expected} | ${r.semMean.toFixed(2)} | ${r.acMean.toFixed(2)} | ` +
    `${r.contrastMean.toFixed(1)} | ${r.contrastStd.toFixed(2)} | ` +
    `${r.contrastStd < 5 ? "✓" : "✗"} | ${r.transcript.slice(0, 40).replace(/\|/g, "\\|")} |`,
  ).join("\n");

  return `# VBTI · Phase 0 · Contrast-Rate Feasibility Spike — Conclusion

_Generated: ${now}_

## Pass criteria (PRD §11)

| Criterion | Threshold | Actual | Verdict |
|---|---|---|---|
| Spread of contrast means | > ${PRD_SPREAD_THRESHOLD} | **${x.spread.toFixed(1)}** | ${x.passSpread ? "✓ PASS" : "✗ PRD FAIL"} |
| Decision C continuation floor | >= ${CONTINUE_SPREAD_THRESHOLD} | **${x.spread.toFixed(1)}** | ${x.continueByDecisionC || x.pass ? "✓ CONTINUE" : "✗ STOP"} |
| Worst-clip Δ stability | std < 5 | **${x.worstStd.toFixed(2)}** | ${x.passStability ? "✓ PASS" : "✗ FAIL"} |
| Mean Δ stability | — | ${x.meanStd.toFixed(2)} | — |
| LLM keyword-fallback rate | — | ${x.fallbacks}/${x.results.length} clips | ${x.fallbacks === 0 ? "clean" : "degraded"} |

## Overall: **${x.pass ? "PASS ✓" : x.continueByDecisionC ? "CONTINUE BY DECISION C ⚠" : "FAIL ✗"}**

${
  x.pass
    ? "Contrast rate is a **real signal, not noise**. VBTI's product bet stands — proceed to Phase 2."
    : x.continueByDecisionC
      ? "Contrast rate missed the original PRD >40 spread threshold on TTS, but the team accepted **Decision C**: TTS is too flat for the original threshold, spread >= 20 with stable runs is enough to continue Phase 2 while recording the risk."
    : "Contrast rate did NOT carry enough signal / was too noisy. **Fall back to the drama-density-only product** (PRD §9 R0). Do not proceed to Phase 2 without a plan change."
}

## Per-clip data (${REPEATS} runs each)

| clip | expected | sem̄ | ac̄ | Δ̄ | Δstd | stable | transcript |
|---|---|---|---|---|---|---|---|
${rows}

## Reproducibility

\`\`\`bash
container exec echoid-dev bash -lc \\
  "cd /app && npx tsx --env-file=.env scripts/phase-0-spike/contrast-spike.ts"
\`\`\`

## Notes for future readers

- Semantic arousal is extracted with a real chat LLM
  (\`LLM_BASE_URL=${process.env.LLM_BASE_URL ?? "?"}\`, model
  \`${process.env.LLM_MODEL ?? "?"}\`). On any LLM failure the runtime falls
  back to \`keywordArousal\`; that path is marked in each clip's summary.
- Acoustic arousal uses the **legacy 14-feature** formula
  (\`f0Std / rmsDr / speechRate / speechRateVar\`, no peak_density yet).
  Once Phase 2 adds peak_density and a proper VBTI baseline, re-run this
  spike and expect *higher* signal quality, not lower.
- Clips are macOS-\`say\` synth — a real deployment will see more diverse
  voices and content. Consider re-running with 3-5 real-human recordings
  once available.
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
