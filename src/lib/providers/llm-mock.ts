import type {
  AnalysisProfile,
  Dimension,
  LLMProfileInput,
  LLMProvider,
} from "@/types/core";

/**
 * Mock LLM: composes deterministic-but-personalized copy from the already-
 * scored dimensions and the matched role, so the pipeline is fully testable
 * without any external API. The dimension objects passed in already carry
 * scores and levelLabels from the scoring engine; the mock just polishes
 * one-liners and stitches a card_copy paragraph.
 */
export class MockLLMProvider implements LLMProvider {
  async generateProfile(input: LLMProfileInput): Promise<AnalysisProfile> {
    const { matchedRole, dimensions, features } = input;

    const dims: Dimension[] = dimensions.map((d) => ({
      ...d,
      oneLiner: d.oneLiner || defaultOneLiner(d),
    }));

    const highlight = [...dims].sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))[0];

    const cardCopy =
      `你说话像${matchedRole.title}。` +
      `${highlight.levelLabel}的${dimLabel(highlight.key)}是你最鲜明的印记——${highlight.oneLiner}。` +
      `语速 ${features.speechRate.toFixed(1)} 字/秒,音调起伏 ${features.f0Std.toFixed(0)} Hz,` +
      `每分钟约 ${features.fillerRate.toFixed(1)} 个语气词。这些细节共同拼成了你此刻的声音质感。`;

    const imagePrompt = matchedRole.imagePromptTemplate
      .replace("{{tempo}}", scoreWord(dims.find((d) => d.key === "thinking_tempo")!.score))
      .replace(
        "{{expressiveness}}",
        scoreWord(dims.find((d) => d.key === "emotional_expressiveness")!.score),
      );

    return {
      matchedRoleId: matchedRole.id,
      roleTitle: matchedRole.title,
      headline: `你说话像${matchedRole.title}`,
      dimensions: dims,
      cardCopy,
      imagePrompt,
    };
  }
}

function defaultOneLiner(d: Dimension): string {
  return `${d.levelLabel}——分值 ${Math.round(d.score)}/100`;
}

function dimLabel(key: string): string {
  switch (key) {
    case "thinking_tempo": return "思维节奏";
    case "emotional_expressiveness": return "情绪外显度";
    case "presence": return "气场";
    case "decision_style": return "决策模式";
    case "communication_style": return "沟通风格";
    case "thinking_depth": return "思维深度";
    default: return key;
  }
}

function scoreWord(score: number): string {
  if (score >= 70) return "high";
  if (score <= 30) return "low";
  return "mid";
}
