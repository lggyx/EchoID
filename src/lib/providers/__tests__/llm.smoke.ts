/**
 * Smoke test for the LLM provider layer.
 *
 * Runs three probes:
 *   1. Mock provider (keyword-based) → sanity on high/low samples.
 *   2. Keyword fallback in isolation → same expected spread.
 *   3. Real OpenAI-compatible endpoint if env is configured (LLM_API_KEY set)
 *      → verifies live arousal extraction is on the wire and returns clean
 *      JSON. Skipped with a note if the env isn't wired.
 *
 * Run inside the dev container:
 *   container exec echoid-dev bash -lc \
 *     "cd /app && npx tsx --env-file=.env src/lib/providers/__tests__/llm.smoke.ts"
 */
import { getLLMProvider } from "@/lib/providers";
import { MockLLMProvider } from "@/lib/providers/llm-mock";
import { OpenAICompatibleLLMProvider } from "@/lib/providers/llm-openai-compatible";
import { keywordArousal } from "@/lib/providers/arousal-fallback";

const SAMPLES: { label: string; transcript: string; expect: "high" | "low" | "mid" }[] = [
  {
    label: "meltdown-rant",
    transcript: "主角死了我要杀了编剧真的绝了气死我了这什么破结局笑死",
    expect: "high",
  },
  {
    label: "flat-shrug",
    transcript: "还行吧就那样也没什么特别的感觉一般般",
    expect: "low",
  },
  {
    // Reference "mid": frustrated but not rage. LLMs correctly score
    // dispassionate expository text as very low, so we pick something
    // with real emotional lean but not screaming.
    label: "mid-heated-work",
    transcript: "这次的方案我觉得挺不合理的其实之前我提过好几次一直没被采纳",
    expect: "mid",
  },
];

function check(label: string, arousal: number, expect: string): string {
  if (expect === "high") return arousal >= 0.6 ? "OK" : "FAIL";
  if (expect === "low") return arousal <= 0.4 ? "OK" : "FAIL";
  return arousal > 0.25 && arousal < 0.75 ? "OK" : "FAIL";
}

async function probeKeywords() {
  console.log("\n=== keyword fallback ===");
  for (const s of SAMPLES) {
    const r = keywordArousal({ transcript: s.transcript });
    console.log(
      `  [${check(s.label, r.arousal, s.expect)}] ${s.label.padEnd(18)} ` +
        `arousal=${r.arousal.toFixed(2)} expect=${s.expect} reason="${r.reason}"`,
    );
  }
}

async function probeMock() {
  console.log("\n=== mock provider ===");
  const p = new MockLLMProvider();
  for (const s of SAMPLES) {
    const r = await p.extractArousal({ transcript: s.transcript });
    console.log(
      `  [${check(s.label, r.arousal, s.expect)}] ${s.label.padEnd(18)} ` +
        `arousal=${r.arousal.toFixed(2)} expect=${s.expect} reason="${r.reason}"`,
    );
  }
}

async function probeReal() {
  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseURL = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  console.log("\n=== real LLM (via env) ===");
  if (!apiKey || !baseURL || !model) {
    console.log("  SKIP: LLM_API_KEY / LLM_BASE_URL / LLM_MODEL not all set.");
    return;
  }
  console.log(`  endpoint: ${baseURL}  model: ${model}`);
  const p = new OpenAICompatibleLLMProvider({ baseURL, apiKey, model });
  for (const s of SAMPLES) {
    const t0 = Date.now();
    try {
      const r = await p.extractArousal({ transcript: s.transcript });
      const dt = Date.now() - t0;
      console.log(
        `  [${check(s.label, r.arousal, s.expect)}] ${s.label.padEnd(18)} ` +
          `arousal=${r.arousal.toFixed(2)} expect=${s.expect} ` +
          `t=${dt}ms reason="${r.reason}"`,
      );
    } catch (err) {
      const dt = Date.now() - t0;
      console.log(
        `  [FAIL] ${s.label.padEnd(18)} t=${dt}ms  err=${(err as Error).message}`,
      );
    }
  }
}

async function probeFactory() {
  console.log("\n=== factory selection ===");
  const p = getLLMProvider();
  console.log(`  picked: ${p.constructor.name}`);
}

async function main() {
  await probeKeywords();
  await probeMock();
  await probeReal();
  await probeFactory();
  console.log("\ndone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
