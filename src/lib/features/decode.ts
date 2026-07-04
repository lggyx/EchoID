import { spawn } from "node:child_process";

/**
 * Decode any input audio (webm/opus/mp4/wav/…) to 16 kHz mono PCM as a
 * Float32Array in [-1, 1]. Uses ffmpeg from PATH; the caller is expected to
 * have ffmpeg installed (Node runtime, not browser).
 */
export interface DecodedAudio {
  /** 16 kHz mono PCM, samples in [-1, 1]. */
  pcm: Float32Array;
  /** Fixed to 16000 for this pipeline. */
  sampleRate: number;
  /** Duration in seconds, derived from pcm.length / sampleRate. */
  duration: number;
}

const TARGET_SR = 16000;

export async function decodeToPcm16kMono(audioPath: string): Promise<DecodedAudio> {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    audioPath,
    "-ac",
    "1",
    "-ar",
    String(TARGET_SR),
    "-f",
    "s16le",
    "-",
  ];

  const chunks: Buffer[] = [];
  const errChunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout.on("data", (b: Buffer) => chunks.push(b));
    proc.stderr.on("data", (b: Buffer) => errChunks.push(b));
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const msg = Buffer.concat(errChunks).toString("utf8").trim();
        reject(new Error(`ffmpeg exited with code ${code}: ${msg}`));
      }
    });
  });

  const raw = Buffer.concat(chunks);
  // Int16 little-endian → Float32 in [-1, 1].
  const sampleCount = raw.length >> 1;
  const pcm = new Float32Array(sampleCount);
  // Use a DataView-free path via Int16Array over an aligned buffer.
  const int16 = new Int16Array(raw.buffer, raw.byteOffset, sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    pcm[i] = int16[i] / 32768;
  }

  return {
    pcm,
    sampleRate: TARGET_SR,
    duration: sampleCount / TARGET_SR,
  };
}
