// Rule-based six-dimension scorer.
// Contract: takes AcousticFeatures, returns Dimension[] of length 6 (all DIMENSION_KEYS).
//
// Design per PRD §3.2:
//  - Each dimension has ONE main feature (weight 0.5) and 2–3 secondaries (~0.25 each)
//    that sum to 1.0. Each contributing feature is normalized to 0..1 via baselines.ts,
//    then combined and scaled ×100.
//  - Some contributions are inverted (e.g., filler ↑ = decisive ↓) or use a signed
//    projection (e.g., a falling end-slope → higher presence/decision).
//  - levelLabel comes from the score band; evidenceMetric surfaces the dominant raw
//    feature for that dimension; oneLiner is a neutral Chinese one-sentence read.

import type { AcousticFeatures, Dimension, DimensionKey } from "@/types/core";
import { DIMENSION_KEYS } from "@/types/core";
import { BASELINES, norm, normAbs, normFalling } from "./baselines";

// ---------- Label tables (strong-side, mild-strong, balanced, mild-opposite, strong-opposite) ----------

const LABELS: Record<DimensionKey, [string, string, string, string, string]> = {
  thinking_tempo: ["急风骤雨", "明快", "均衡", "从容", "慢火细熬"],
  emotional_expressiveness: ["起伏鲜明", "灵动", "均衡", "内敛", "沉静如水"],
  presence: ["沉稳笃定", "稳重", "均衡", "轻盈", "轻盈跳跃"],
  decision_style: ["果断利落", "明快", "均衡", "慎思", "反复推敲"],
  communication_style: ["亲和健谈", "热络", "均衡", "含蓄", "清冷疏离"],
  thinking_depth: ["层层递进", "深入", "均衡", "简明", "直觉直白"],
};

function bandIndex(score: number): 0 | 1 | 2 | 3 | 4 {
  if (score >= 80) return 0;
  if (score >= 60) return 1;
  if (score >= 40) return 2;
  if (score >= 20) return 3;
  return 4;
}

function labelFor(key: DimensionKey, score: number): string {
  return LABELS[key][bandIndex(score)];
}

// ---------- One-liner copy (neutral, non-judgmental) ----------

const ONE_LINERS: Record<DimensionKey, [string, string, string, string, string]> = {
  thinking_tempo: [
    "你的节奏连贯明快，信息推进得很紧凑。",
    "你说话节奏偏快，语流顺畅。",
    "你的语速处在均衡区间，既不赶也不拖。",
    "你说话节奏从容，愿意留出停顿。",
    "你的节奏慢火细熬，句与句之间留有余韵。",
  ],
  emotional_expressiveness: [
    "你的语调起伏鲜明，情绪信号很清晰。",
    "你的语调有明显起伏，表达带有色彩。",
    "你的情绪表达处在均衡区间，浓淡自然切换。",
    "你的情绪表达偏内敛，更多藏在字里行间。",
    "你的语调沉静如水，几乎不外露情绪。",
  ],
  presence: [
    "你的声音沉稳笃定，天然带有分量感。",
    "你的声音稳重，容易让人安心。",
    "你的存在感处在均衡区间，可轻可重。",
    "你的声音轻盈，气息偏松弛。",
    "你的声音轻盈跳跃，像贴着耳边讲话。",
  ],
  decision_style: [
    "你表述果断利落，几乎不留犹豫的痕迹。",
    "你的表达明快清晰，判断给得干脆。",
    "你的决断风格均衡，既留斟酌也给结论。",
    "你的表达偏慎思，喜欢补充和限定条件。",
    "你的表达反复推敲，语气词与修饰较多。",
  ],
  communication_style: [
    "你亲和健谈，语气自然贴近听者。",
    "你的表达热络，愿意接话续话。",
    "你的沟通风格处在均衡区间，可近可远。",
    "你的表达偏含蓄，用词克制。",
    "你的表达清冷疏离，语气更像叙述而非交谈。",
  ],
  thinking_depth: [
    "你的思路层层递进，结构感很强。",
    "你的表述带有明显的展开与延伸。",
    "你的思考深度处在均衡区间，繁简都能切换。",
    "你的表达偏简明，一句话点到即止。",
    "你的表达接近直觉直白，凭第一反应出口。",
  ],
};

function oneLinerFor(key: DimensionKey, score: number): string {
  return ONE_LINERS[key][bandIndex(score)];
}

// ---------- Evidence metric formatter ----------

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

function evidenceFor(key: DimensionKey, f: AcousticFeatures): string {
  switch (key) {
    case "thinking_tempo":
      return `语速 ${fmt(f.speechRate)} 字/秒`;
    case "emotional_expressiveness":
      return `音调起伏 ${fmt(f.f0Std, 0)} Hz`;
    case "presence":
      return `音量均值 ${fmt(f.rmsMean, 2)}`;
    case "decision_style":
      return `语气词 ${fmt(f.fillerRate)} 次/分`;
    case "communication_style":
      return `语气词 ${fmt(f.fillerRate)} 次/分`;
    case "thinking_depth":
      return `词汇丰富度 ${fmt(f.ttr, 2)}`;
  }
}

// ---------- Per-dimension scoring ----------

function clip01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** thinking_tempo — high = fast. main: speechRate; secondaries: (1-pauseCount), speechRateVar. */
function scoreTempo(f: AcousticFeatures): number {
  const main = norm(f.speechRate, BASELINES.speechRate);
  const s1 = 1 - norm(f.pauseCount, BASELINES.pauseCount);
  const s2 = norm(f.speechRateVar, BASELINES.speechRateVar);
  return clip01(main * 0.5 + s1 * 0.25 + s2 * 0.25) * 100;
}

/** emotional_expressiveness — high = expressive. main: f0Std; secondaries: rmsDr, |pitchSlopeEnd|. */
function scoreExpr(f: AcousticFeatures): number {
  const main = norm(f.f0Std, BASELINES.f0Std);
  const s1 = norm(f.rmsDr, BASELINES.rmsDr);
  const s2 = normAbs(f.pitchSlopeEnd, BASELINES.pitchSlopeEnd);
  return clip01(main * 0.5 + s1 * 0.25 + s2 * 0.25) * 100;
}

/** presence — high = grounded. main: rmsMean; secondaries: (1-speechRateVar), falling-slope, (1-f0Mean). */
function scorePresence(f: AcousticFeatures): number {
  const main = norm(f.rmsMean, BASELINES.rmsMean);
  const s1 = 1 - norm(f.speechRateVar, BASELINES.speechRateVar);
  const s2 = normFalling(f.pitchSlopeEnd, BASELINES.pitchSlopeEnd);
  const s3 = 1 - norm(f.f0Mean, BASELINES.f0Mean);
  // 0.5 + 3×0.1667 ≈ 1.0
  return clip01(main * 0.5 + (s1 + s2 + s3) * (0.5 / 3)) * 100;
}

/** decision_style — high = decisive. main: (1-filler); secondaries: falling-slope, (1-speechRateVar). */
function scoreDecision(f: AcousticFeatures): number {
  const main = 1 - norm(f.fillerRate, BASELINES.fillerRate);
  const s1 = normFalling(f.pitchSlopeEnd, BASELINES.pitchSlopeEnd);
  const s2 = 1 - norm(f.speechRateVar, BASELINES.speechRateVar);
  return clip01(main * 0.5 + s1 * 0.25 + s2 * 0.25) * 100;
}

/** communication_style — high = warm/talkative. main: fillerRate; secondaries: f0Mean, f0Std, speechRate. */
function scoreComm(f: AcousticFeatures): number {
  const main = norm(f.fillerRate, BASELINES.fillerRate);
  const s1 = norm(f.f0Mean, BASELINES.f0Mean);
  const s2 = norm(f.f0Std, BASELINES.f0Std);
  const s3 = norm(f.speechRate, BASELINES.speechRate);
  return clip01(main * 0.5 + (s1 + s2 + s3) * (0.5 / 3)) * 100;
}

/** thinking_depth — high = deep. main: ttr; secondaries: sentLen, thoughtful-pause. */
function scoreDepth(f: AcousticFeatures): number {
  const main = norm(f.ttr, BASELINES.ttr);
  const s1 = norm(f.sentLen, BASELINES.sentLen);
  // "thoughtful pauses": pauseDurAvg above 0.4s → contributes, saturates around 0.8s.
  const s2 = clip01((f.pauseDurAvg - 0.4) / 0.4);
  return clip01(main * 0.5 + s1 * 0.25 + s2 * 0.25) * 100;
}

const SCORERS: Record<DimensionKey, (f: AcousticFeatures) => number> = {
  thinking_tempo: scoreTempo,
  emotional_expressiveness: scoreExpr,
  presence: scorePresence,
  decision_style: scoreDecision,
  communication_style: scoreComm,
  thinking_depth: scoreDepth,
};

/** Main entry: score all six dimensions. */
export function scoreDimensions(features: AcousticFeatures): Dimension[] {
  return DIMENSION_KEYS.map((key) => {
    const score = Math.round(SCORERS[key](features));
    return {
      key,
      score,
      levelLabel: labelFor(key, score),
      oneLiner: oneLinerFor(key, score),
      evidenceMetric: evidenceFor(key, features),
    };
  });
}
