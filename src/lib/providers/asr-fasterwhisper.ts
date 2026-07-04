import { promises as fs } from "node:fs";
import path from "node:path";
import type { ASRProvider, ASRResult } from "@/types/core";

/**
 * ASR provider backed by the local echoid-asr microservice (faster-whisper).
 *
 * The service exposes POST /transcribe (multipart) and returns
 * { text, words[], language, duration }. We normalize to ASRResult.
 *
 * Endpoint is configured via ASR_ENDPOINT env var, defaulting to the compose
 * hostname (echoid-asr:8000) but falling back to the host gateway for local
 * dev runs where DNS between containers isn't set up.
 */
export class FasterWhisperASRProvider implements ASRProvider {
  constructor(
    private endpoint: string = process.env.ASR_ENDPOINT ?? "http://192.168.64.1:8000",
    private language: string = process.env.ASR_LANGUAGE ?? "zh",
  ) {}

  async transcribe(audio: { path: string; mimeType: string }): Promise<ASRResult> {
    const buf = await fs.readFile(audio.path);
    const filename = path.basename(audio.path) || "audio.bin";
    const blob = new Blob([buf], { type: audio.mimeType || "application/octet-stream" });

    const form = new FormData();
    form.append("audio", blob, filename);
    form.append("language", this.language);

    const res = await fetch(`${this.endpoint}/transcribe`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ASR service ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      text: string;
      words: { text: string; start: number; end: number }[];
      language?: string;
      duration?: number;
    };

    return {
      text: data.text ?? "",
      words: Array.isArray(data.words) ? data.words : [],
    };
  }
}
