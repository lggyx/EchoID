/**
 * Public entry point for acoustic feature extraction.
 *
 *   extractAcousticFeatures({ audioPath, mimeType, asrResult })
 *     → decode input to 16 kHz mono PCM
 *     → single-pass RMS + YIN F0 + energy VAD
 *     → combine with ASR words/text
 *     → return the 14-field AcousticFeatures contract in src/types/core.ts.
 */

import type { AcousticFeatures, ASRResult } from "@/types/core";
import { decodeToPcm16kMono } from "./decode";
import { computeRms, HOP_SIZE } from "./rms";
import { computePitch } from "./pitch";
import { computeVad, type Segment } from "./vad";
import { computeTextFeatures, windowedSpeechRates, std } from "./text";
import { computeVbtiFrameFeatures } from "./vbti";

export interface ExtractInput {
  audioPath: string;
  mimeType: string;
  asrResult: ASRResult;
}

export async function extractAcousticFeatures(input: ExtractInput): Promise<AcousticFeatures> {
  const { audioPath, asrResult } = input;

  const { pcm, sampleRate, duration } = await decodeToPcm16kMono(audioPath);

  const rmsRes = computeRms(pcm);
  const pitchRes = computePitch(pcm, rmsRes.rms, sampleRate);
  const vad = computeVad(rmsRes.rms, sampleRate);

  // ---- Pause features ----
  const pauseCount = vad.pauses.length;
  const pauseDurAvg =
    pauseCount === 0 ? 0 : vad.pauses.reduce((a, p) => a + (p.end - p.start), 0) / pauseCount;
  const pauseRatio = duration > 0 ? vad.silenceDuration / duration : 0;

  // ---- Pitch stats over voiced frames ----
  const voicedF0: number[] = [];
  for (let i = 0; i < pitchRes.frameCount; i++) {
    if (pitchRes.voiced[i]) voicedF0.push(pitchRes.f0[i]);
  }
  const f0Mean = voicedF0.length === 0 ? 0 : voicedF0.reduce((a, b) => a + b, 0) / voicedF0.length;
  const f0Std = voicedF0.length < 2 ? 0 : std(voicedF0);
  const f0Range = voicedF0.length === 0 ? 0 : Math.max(...voicedF0) - Math.min(...voicedF0);

  // ---- RMS stats over speech frames only (to avoid diluting with silence) ----
  const speechRms: number[] = [];
  for (let i = 0; i < rmsRes.frameCount; i++) {
    if (vad.isSpeechFrame[i]) speechRms.push(rmsRes.rms[i]);
  }
  const rmsPool = speechRms.length > 0 ? speechRms : Array.from(rmsRes.rms);
  const rmsMean = rmsPool.length === 0 ? 0 : rmsPool.reduce((a, b) => a + b, 0) / rmsPool.length;
  const rmsDr = rmsPool.length === 0 ? 0 : Math.max(...rmsPool) - Math.min(...rmsPool);

  // ---- Pitch slope at sentence-ends ----
  const pitchSlopeEnd = computePitchSlopeEnd(vad.speech, pitchRes.f0, pitchRes.voiced, sampleRate);

  // ---- Text features ----
  const text = computeTextFeatures(asrResult, duration);

  // ---- Speech rate ----
  const totalChars = countCjk(asrResult.text);
  const voicedSpeechDuration = vad.speechDuration;
  const speechRate =
    voicedSpeechDuration > 0.05 ? totalChars / voicedSpeechDuration : totalChars / Math.max(duration, 1e-6);
  const perWindow = windowedSpeechRates(asrResult, 3);
  const speechRateVar = std(perWindow);
  const vbti = computeVbtiFrameFeatures({
    rms: rmsRes.rms,
    f0: pitchRes.f0,
    voiced: pitchRes.voiced,
    pauses: vad.pauses,
    speech: vad.speech,
    duration,
    sampleRate,
  });

  return {
    duration,
    speechRate,
    speechRateVar,
    pauseCount,
    pauseDurAvg,
    pauseRatio,
    f0Mean,
    f0Std,
    f0Range,
    rmsMean,
    rmsDr,
    pitchSlopeEnd,
    fillerRate: text.fillerRate,
    ttr: text.ttr,
    sentLen: text.sentLen,
    peakDensity: vbti.peakDensity,
    pauseRegularity: vbti.pauseRegularity,
    burstStops: vbti.burstStops,
  };
}

function countCjk(text: string): number {
  let n = 0;
  for (const ch of text) if (/[\u4e00-\u9fff]/.test(ch)) n++;
  return n;
}

/**
 * For each speech segment ≥ 500 ms, take voiced F0 samples that fall in the
 * final 300 ms of the segment, fit a linear slope (Hz per second), and return
 * the mean slope across qualifying segments. Zero if none.
 */
function computePitchSlopeEnd(
  speechSegs: Segment[],
  f0: Float32Array,
  voiced: Uint8Array,
  sampleRate: number,
): number {
  const slopes: number[] = [];
  for (const seg of speechSegs) {
    if (seg.end - seg.start < 0.5) continue;
    const tailStart = seg.end - 0.3;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = seg.startFrame; i < seg.endFrame; i++) {
      if (!voiced[i]) continue;
      const t = (i * HOP_SIZE) / sampleRate;
      if (t < tailStart) continue;
      xs.push(t);
      ys.push(f0[i]);
    }
    if (xs.length < 3) continue;
    const slope = linRegSlope(xs, ys);
    if (Number.isFinite(slope)) slopes.push(slope);
  }
  if (slopes.length === 0) return 0;
  return slopes.reduce((a, b) => a + b, 0) / slopes.length;
}

function linRegSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    num += dx * (ys[i] - my);
    den += dx * dx;
  }
  if (den === 0) return 0;
  return num / den;
}
