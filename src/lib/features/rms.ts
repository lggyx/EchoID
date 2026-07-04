/**
 * Frame-level RMS energy over 16 kHz mono PCM.
 * Frame size 25 ms (400 samples @ 16k), hop 10 ms (160 samples).
 */

export const FRAME_SIZE = 400;
export const HOP_SIZE = 160;

export interface RmsResult {
  /** RMS value per frame, in the same amplitude scale as the input (0..~1). */
  rms: Float32Array;
  /** Frame count. */
  frameCount: number;
  frameSize: number;
  hopSize: number;
}

export function computeRms(pcm: Float32Array): RmsResult {
  const frameCount = pcm.length < FRAME_SIZE ? 0 : Math.floor((pcm.length - FRAME_SIZE) / HOP_SIZE) + 1;
  const rms = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP_SIZE;
    let sum = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const s = pcm[start + i];
      sum += s * s;
    }
    rms[f] = Math.sqrt(sum / FRAME_SIZE);
  }
  return { rms, frameCount, frameSize: FRAME_SIZE, hopSize: HOP_SIZE };
}

/** Return the frame start time in seconds for frame index `f`. */
export function frameTime(f: number, sampleRate: number): number {
  return (f * HOP_SIZE) / sampleRate;
}
