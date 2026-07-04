/**
 * Energy-based Voice Activity Detection over per-frame RMS values.
 *
 * Algorithm:
 *   1. Threshold = max(0.02, 0.3 * median RMS of the loudest 20% of frames).
 *   2. Speech starts when ≥ SPEECH_MIN_FRAMES consecutive frames are above.
 *   3. Silence starts when ≥ SILENCE_MIN_FRAMES (150 ms) consecutive frames are below.
 *   4. Pauses are silence segments ≥ 200 ms that are NOT at the very start/end.
 */

import { HOP_SIZE } from "./rms";

const SPEECH_MIN_FRAMES = 5; // 50 ms
const SILENCE_MIN_FRAMES = 15; // 150 ms
const PAUSE_MIN_SEC = 0.2;

export interface Segment {
  /** Start time in seconds (frame boundary). */
  start: number;
  /** End time in seconds (frame boundary). */
  end: number;
  /** startFrame index (inclusive). */
  startFrame: number;
  /** endFrame index (exclusive). */
  endFrame: number;
}

export interface VadResult {
  /** Speech segments in chronological order. */
  speech: Segment[];
  /** Silence segments (may include leading/trailing silence). */
  silence: Segment[];
  /** Silence segments that qualify as pauses (≥ 200 ms, not at extremes). */
  pauses: Segment[];
  /** Total voiced/speech duration in seconds. */
  speechDuration: number;
  /** Total silence duration in seconds. */
  silenceDuration: number;
  /** The threshold that was applied. */
  threshold: number;
  /** Per-frame boolean, true iff frame is inside a speech segment. */
  isSpeechFrame: Uint8Array;
}

export function computeVad(rms: Float32Array, sampleRate: number): VadResult {
  const nFrames = rms.length;
  const framesToSec = (n: number) => (n * HOP_SIZE) / sampleRate;

  // 1. Compute threshold from the loudest 20% of frames.
  const threshold = deriveThreshold(rms);

  // 2. Raw above/below flags with hysteresis smoothing.
  const above = new Uint8Array(nFrames);
  for (let i = 0; i < nFrames; i++) above[i] = rms[i] > threshold ? 1 : 0;

  const isSpeech = new Uint8Array(nFrames);
  let i = 0;
  let state: "silence" | "speech" = "silence";
  while (i < nFrames) {
    if (state === "silence") {
      // Look for SPEECH_MIN_FRAMES consecutive above frames.
      if (above[i]) {
        let run = 0;
        let j = i;
        while (j < nFrames && above[j]) {
          run++;
          j++;
        }
        if (run >= SPEECH_MIN_FRAMES) {
          for (let k = i; k < j; k++) isSpeech[k] = 1;
          i = j;
          state = "speech";
          continue;
        }
      }
      i++;
    } else {
      // In speech. Extend until we see SILENCE_MIN_FRAMES consecutive below frames.
      if (!above[i]) {
        let run = 0;
        let j = i;
        while (j < nFrames && !above[j]) {
          run++;
          j++;
        }
        if (run >= SILENCE_MIN_FRAMES) {
          // Speech ended at i.
          state = "silence";
          i = j;
          continue;
        } else {
          // Short dip inside speech — keep marking as speech.
          for (let k = i; k < j; k++) isSpeech[k] = 1;
          i = j;
          continue;
        }
      } else {
        isSpeech[i] = 1;
        i++;
      }
    }
  }

  // 3. Extract segments from isSpeech.
  const speech: Segment[] = [];
  const silence: Segment[] = [];
  let cur = isSpeech[0] ?? 0;
  let segStart = 0;
  for (let k = 1; k <= nFrames; k++) {
    const v = k < nFrames ? isSpeech[k] : -1;
    if (v !== cur) {
      const seg: Segment = {
        start: framesToSec(segStart),
        end: framesToSec(k),
        startFrame: segStart,
        endFrame: k,
      };
      if (cur === 1) speech.push(seg);
      else silence.push(seg);
      segStart = k;
      cur = v === -1 ? 0 : v;
    }
  }

  // 4. Pauses = silence ≥ 200ms and NOT at the very start/end.
  const totalDuration = framesToSec(nFrames);
  const pauses: Segment[] = silence.filter((s) => {
    const dur = s.end - s.start;
    if (dur < PAUSE_MIN_SEC) return false;
    if (s.start <= 1e-6) return false; // leading silence
    if (Math.abs(s.end - totalDuration) < 1e-6) return false; // trailing silence
    return true;
  });

  const speechDuration = speech.reduce((acc, s) => acc + (s.end - s.start), 0);
  const silenceDuration = silence.reduce((acc, s) => acc + (s.end - s.start), 0);

  return {
    speech,
    silence,
    pauses,
    speechDuration,
    silenceDuration,
    threshold,
    isSpeechFrame: isSpeech,
  };
}

function deriveThreshold(rms: Float32Array): number {
  if (rms.length === 0) return 0.02;
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const cutoff = Math.floor(sorted.length * 0.8);
  const top = sorted.slice(cutoff);
  const medianTop = top.length > 0 ? top[Math.floor(top.length / 2)] : sorted[sorted.length - 1];
  return Math.max(0.02, 0.3 * medianTop);
}
