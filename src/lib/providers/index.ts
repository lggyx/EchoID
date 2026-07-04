import path from "node:path";
import type { ASRProvider, ImageProvider, LLMProvider } from "@/types/core";
import { MockASRProvider } from "./asr-mock";
import { FasterWhisperASRProvider } from "./asr-fasterwhisper";
import { MockLLMProvider } from "./llm-mock";
import { OpenAICompatibleLLMProvider } from "./llm-openai-compatible";
import { MockImageProvider } from "./image-mock";
import { StaticImageProvider } from "./image-static";

/**
 * Provider factory. Selection strategy:
 *  - ASR: `ASR_PROVIDER=mock` for tests, otherwise the faster-whisper sidecar.
 *  - LLM: any OpenAI chat/completions-compatible endpoint works — pick by env
 *    (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). Empty API key = mock.
 *  - Image: static persona portraits under public/personas/ by default
 *    (VBTI PRD §5.5 · D2). `IMAGE_PROVIDER=mock` opts into the on-the-fly
 *    SVG generator, kept for local dev when new personas don't yet have art.
 */

const storageDir = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? "./storage");

export function getASRProvider(): ASRProvider {
  switch (process.env.ASR_PROVIDER) {
    case "mock":
      return new MockASRProvider();
    case "fasterwhisper":
    default:
      return new FasterWhisperASRProvider();
  }
}

export function getLLMProvider(): LLMProvider {
  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseURL = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (apiKey && baseURL && model) {
    return new OpenAICompatibleLLMProvider({ apiKey, baseURL, model });
  }
  return new MockLLMProvider();
}

export function getImageProvider(): ImageProvider {
  switch (process.env.IMAGE_PROVIDER) {
    case "mock":
      return new MockImageProvider(storageDir);
    case "static":
    default:
      return new StaticImageProvider();
  }
}

export { storageDir };
