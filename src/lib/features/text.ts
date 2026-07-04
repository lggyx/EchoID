/**
 * Text-derived features from an ASR result:
 *   - fillerRate: filler-word occurrences per minute of total audio.
 *   - ttr: unique-char count / total-char count (Chinese character level).
 *   - sentLen: average sentence length in characters.
 *   - speech-rate windowing helpers used by extract.ts to compute speechRateVar.
 *
 * NOTE (MVP simplification): We treat each Chinese character as a "token" for
 * TTR — no word segmentation. This is a deliberate approximation.
 */

import type { ASRResult } from "@/types/core";

export const FILLER_WORDS = [
  "嗯",
  "啊",
  "呃",
  "那个",
  "就是",
  "然后",
  "呢",
  "哈",
  "唉",
  "额",
];

const SENTENCE_SPLIT_RE = /[。！？，]/;
const CJK_RE = /[\u4e00-\u9fff]/;

export interface TextFeatures {
  fillerRate: number;
  ttr: number;
  sentLen: number;
}

export function computeTextFeatures(asr: ASRResult, durationSec: number): TextFeatures {
  const text = asr.text ?? "";

  // Filler rate: raw substring counting is enough for the MVP filler list.
  let fillerCount = 0;
  for (const f of FILLER_WORDS) {
    if (!f) continue;
    // Count non-overlapping occurrences.
    let idx = 0;
    while (true) {
      const hit = text.indexOf(f, idx);
      if (hit < 0) break;
      fillerCount++;
      idx = hit + f.length;
    }
  }
  const durationMin = Math.max(durationSec / 60, 1e-6);
  const fillerRate = fillerCount / durationMin;

  // TTR over CJK characters only.
  const chars: string[] = [];
  for (const ch of text) {
    if (CJK_RE.test(ch)) chars.push(ch);
  }
  const ttr = chars.length === 0 ? 0 : new Set(chars).size / chars.length;

  // Average sentence length in chars (non-empty pieces only).
  const pieces = text
    .split(SENTENCE_SPLIT_RE)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const sentLen =
    pieces.length === 0
      ? 0
      : pieces.reduce((acc, p) => acc + Array.from(p).length, 0) / pieces.length;

  return { fillerRate, ttr, sentLen };
}

/**
 * Split ASR words into ~windowSec buckets and return per-window
 * char-per-second rate for each non-empty window.
 */
export function windowedSpeechRates(asr: ASRResult, windowSec = 3): number[] {
  if (!asr.words || asr.words.length === 0) return [];
  const end = asr.words[asr.words.length - 1].end;
  const nWindows = Math.max(1, Math.ceil(end / windowSec));
  const counts = new Array(nWindows).fill(0);
  const spans = new Array(nWindows).fill(0);

  for (const w of asr.words) {
    const mid = (w.start + w.end) / 2;
    const idx = Math.min(nWindows - 1, Math.floor(mid / windowSec));
    // Only count actual CJK chars in the token.
    let cjk = 0;
    for (const ch of w.text) if (CJK_RE.test(ch)) cjk++;
    counts[idx] += cjk;
    spans[idx] = Math.max(spans[idx], w.end - Math.floor(w.start / windowSec) * windowSec);
  }

  const rates: number[] = [];
  for (let i = 0; i < nWindows; i++) {
    if (counts[i] === 0) continue;
    // Use the nominal window length (last window may be short but that's fine).
    const winLen = i === nWindows - 1 ? Math.max(0.1, end - i * windowSec) : windowSec;
    rates.push(counts[i] / winLen);
  }
  return rates;
}

export function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
