/**
 * YIN F0 estimator (classical algorithm, per-frame).
 *
 * Reference: de Cheveigné & Kawahara, "YIN, a fundamental frequency estimator
 * for speech and music", 2002.
 *
 * Steps: difference function → cumulative mean normalized difference
 *        → absolute threshold search (~0.15) → parabolic interpolation.
 *
 * Search range: 60–500 Hz. Frames are marked voiced iff the YIN threshold
 * is met AND the frame's RMS is above a small noise floor.
 */

import { FRAME_SIZE, HOP_SIZE } from "./rms";

const F0_MIN = 60;
const F0_MAX = 500;
const YIN_THRESHOLD = 0.15;
const RMS_NOISE_FLOOR = 0.01;

export interface PitchResult {
  /** F0 in Hz per frame (0 for unvoiced). */
  f0: Float32Array;
  /** 1 iff voiced, else 0. */
  voiced: Uint8Array;
  frameCount: number;
}

export function computePitch(pcm: Float32Array, rms: Float32Array, sampleRate: number): PitchResult {
  const nFrames = rms.length;
  const f0 = new Float32Array(nFrames);
  const voiced = new Uint8Array(nFrames);

  const tauMin = Math.max(2, Math.floor(sampleRate / F0_MAX));
  const tauMax = Math.min(FRAME_SIZE - 1, Math.floor(sampleRate / F0_MIN));

  // Reusable buffer for the CMND function.
  const cmnd = new Float32Array(tauMax + 1);

  for (let f = 0; f < nFrames; f++) {
    const start = f * HOP_SIZE;
    if (start + FRAME_SIZE > pcm.length) break;

    // Skip low-energy frames immediately.
    if (rms[f] < RMS_NOISE_FLOOR) continue;

    // 1) Difference function d(tau) for tau in [0, tauMax].
    //    d(tau) = sum_{j=0..W-1} (x[j] - x[j+tau])^2, with W = FRAME_SIZE - tauMax
    //    (so all reads stay in-frame).
    const W = FRAME_SIZE - tauMax;
    // 2) Cumulative mean normalized diff simultaneously.
    cmnd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < W; j++) {
        const diff = pcm[start + j] - pcm[start + j + tau];
        sum += diff * diff;
      }
      running += sum;
      cmnd[tau] = running > 0 ? (sum * tau) / running : 1;
    }

    // 3) Absolute threshold: find first tau ≥ tauMin where cmnd < YIN_THRESHOLD
    //    and it is a local minimum (cmnd[tau] < cmnd[tau+1]).
    let tauEst = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau] < YIN_THRESHOLD) {
        // Descend to the local minimum.
        while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
        tauEst = tau;
        break;
      }
    }

    if (tauEst < 0) continue;

    // 4) Parabolic interpolation around tauEst.
    const refined = parabolicInterp(cmnd, tauEst, tauMin, tauMax);
    const freq = sampleRate / refined;
    if (freq >= F0_MIN && freq <= F0_MAX) {
      f0[f] = freq;
      voiced[f] = 1;
    }
  }

  return { f0, voiced, frameCount: nFrames };
}

function parabolicInterp(d: Float32Array, tau: number, tauMin: number, tauMax: number): number {
  if (tau <= tauMin || tau >= tauMax) return tau;
  const s0 = d[tau - 1];
  const s1 = d[tau];
  const s2 = d[tau + 1];
  const denom = s0 + s2 - 2 * s1;
  if (denom === 0) return tau;
  return tau + (s0 - s2) / (2 * denom);
}
