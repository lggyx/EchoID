import path from "node:path";
import type { ASRProvider, ImageProvider, LLMProvider } from "@/types/core";
import { MockASRProvider } from "./asr-mock";
import { FasterWhisperASRProvider } from "./asr-fasterwhisper";
import { MockLLMProvider } from "./llm-mock";
import { MockImageProvider } from "./image-mock";

/**
 * Provider factory. Reads env to decide which implementation to use. For MVP
 * only the "mock" implementations exist; real providers can be added later
 * behind the same interfaces without touching call sites.
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
  switch (process.env.LLM_PROVIDER) {
    case "mock":
    default:
      return new MockLLMProvider();
  }
}

export function getImageProvider(): ImageProvider {
  switch (process.env.IMAGE_PROVIDER) {
    case "mock":
    default:
      return new MockImageProvider(storageDir);
  }
}

export { storageDir };
