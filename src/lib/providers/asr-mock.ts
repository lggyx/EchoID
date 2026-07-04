import type { ASRProvider, ASRResult } from "@/types/core";

/**
 * Mock ASR: fabricates a plausible Chinese transcript sized to the audio
 * duration (~4.5 chars/sec), producing word-level timestamps that downstream
 * feature extraction can consume without hitting a real ASR API.
 */
export class MockASRProvider implements ASRProvider {
  async transcribe(_audio: { path: string; mimeType: string }): Promise<ASRResult> {
    // We don't actually decode the audio in the mock; we assume ~20s.
    // The real pipeline will pass in the true duration; here we just fabricate.
    const durationSec = 20;

    const sampleSentences = [
      "周末的时候我一般会去附近的公园走一走",
      "然后找一家安静的咖啡馆坐下来看会儿书",
      "有时候也会约朋友一起去看电影",
      "嗯就是那种不需要动脑子的放松",
      "我觉得这样的节奏挺舒服的",
    ];

    const fullText = sampleSentences.join("，") + "。";
    const chars = Array.from(fullText);
    const perChar = durationSec / chars.length;

    const words = chars.map((ch, i) => ({
      text: ch,
      start: +(i * perChar).toFixed(3),
      end: +((i + 1) * perChar).toFixed(3),
    }));

    return { text: fullText, words };
  }
}
