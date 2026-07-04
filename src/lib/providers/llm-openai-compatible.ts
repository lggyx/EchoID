import type {
  AnalysisProfile,
  ArousalResult,
  LLMArousalInput,
  LLMProfileInput,
  LLMProvider,
} from "@/types/core";

/**
 * OpenAI chat/completions-compatible LLM provider.
 *
 * Talks to any endpoint that speaks the OpenAI chat completions protocol
 * (openai.com, openai-next, DeepSeek, Moonshot, Groq, Ollama, …). Selection
 * is via `LLM_BASE_URL / LLM_API_KEY / LLM_MODEL` env vars — no per-vendor
 * subclass needed.
 *
 * Design notes:
 *  - We ask the model for JSON via a strict system prompt and parse defensively
 *    (strip markdown fences, tolerate leading/trailing prose).
 *  - `extractArousal` is the VBTI-critical path. It runs 5× per user request
 *    (one per segment) so we keep temperature=0 and max_tokens small.
 *  - Callers are expected to `try/catch` and fall back to the keyword estimator
 *    on failure. See `arousal-fallback.ts`.
 */

interface OpenAICompatibleOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  /** Per-request timeout in ms. Default 30s. */
  timeoutMs?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message?: { role: string; content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
}

export class OpenAICompatibleLLMProvider implements LLMProvider {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: OpenAICompatibleOptions) {
    this.baseURL = opts.baseURL.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async extractArousal(input: LLMArousalInput): Promise<ArousalResult> {
    const contextLine = input.context
      ? `Context (may bias interpretation): ${input.context}\n`
      : "";
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You extract emotional arousal from Chinese text. Output ONLY compact JSON, no prose, no markdown fences. Arousal is on a 0..1 scale where 0 = utterly flat/detached and 1 = extremely worked up. Interpret the WORDS ONLY — do not guess about voice tone. Sarcasm counts as high arousal.",
      },
      {
        role: "user",
        content:
          `${contextLine}Text: ${input.transcript}\n` +
          `Output: {"arousal": <number 0..1>, "reason": "<不超过 12 汉字的说明>"}`,
      },
    ];

    const content = await this.chat(messages, { maxTokens: 80 });
    const parsed = parseJsonLenient(content);
    return coerceArousal(parsed);
  }

  async generateProfile(_input: LLMProfileInput): Promise<AnalysisProfile> {
    // TODO(vbti): once the VBTI AnalysisProfile shape (headline / card_copy /
    // evidence / persona_id / image_prompt) is agreed with tracks A & B in
    // src/types/core.ts, wire it here. For now the EchoID mock still produces
    // profile output; this branch is only exercised by extractArousal().
    throw new Error(
      "OpenAICompatibleLLMProvider.generateProfile is not implemented yet — pending VBTI AnalysisProfile schema.",
    );
  }

  // ---------- internals ----------

  private async chat(
    messages: ChatMessage[],
    opts: { maxTokens: number; temperature?: number },
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: opts.maxTokens,
          temperature: opts.temperature ?? 0,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`LLM ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as ChatCompletionResponse;
      if (data.error?.message) {
        throw new Error(`LLM error: ${data.error.message}`);
      }
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        throw new Error(
          `LLM returned empty content (finish=${data.choices?.[0]?.finish_reason ?? "?"})`,
        );
      }
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------- helpers ----------

/**
 * Try hard to pull a JSON object out of an LLM response. Some models still
 * wrap output in ```json fences or add leading text despite instructions.
 */
function parseJsonLenient(raw: string): unknown {
  const trimmed = raw.trim();
  // Fast path.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  // Strip common ```json fences.
  const fenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(fenced);
  } catch {
    /* fall through */
  }
  // Grab the first {...} block.
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = fenced.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      /* fall through */
    }
  }
  throw new Error(`unparseable LLM JSON: ${trimmed.slice(0, 160)}`);
}

function coerceArousal(raw: unknown): ArousalResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("arousal payload is not an object");
  }
  const obj = raw as Record<string, unknown>;
  const n = Number(obj.arousal);
  if (!Number.isFinite(n)) {
    throw new Error(`arousal is not a number: ${JSON.stringify(obj.arousal)}`);
  }
  const arousal = Math.max(0, Math.min(1, n));
  const reason = typeof obj.reason === "string" ? obj.reason : "";
  return { arousal, reason };
}
