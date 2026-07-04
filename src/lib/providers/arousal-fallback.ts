import type { ArousalResult, LLMArousalInput } from "@/types/core";

/**
 * Keyword-based arousal estimator — the fallback when the real LLM times out,
 * returns non-JSON, or is otherwise unavailable. It's crude but it never fails
 * silently: a segment full of "绝了 / 笑死 / 我操" gets a high score, a
 * segment of "还行吧就那样" gets a low score, and a middle band gets 0.5.
 *
 * The word lists are hand-curated for Mandarin colloquial expressions; if
 * upstream data starts leaning toward Cantonese / regional dialects, extend
 * them here. Weights are additive up to a hard cap.
 */

const HIGH_AROUSAL_TOKENS = [
  // meltdown / rage
  "绝了", "破防", "无语", "服了", "醉了", "麻了", "上头", "炸了",
  "气死", "气炸", "笑死", "笑死我", "笑死了", "笑麻了", "我死了",
  "我操", "卧槽", "我靠", "牛逼", "牛批", "牛掰", "傻逼", "傻鸟",
  "妈的", "他妈", "特么", "尼玛",
  // extreme adjectives
  "太尼玛", "太特么", "太他妈", "极度", "疯狂", "疯了", "崩溃",
  "离谱", "夸张", "过分", "受不了", "顶不住", "顶了", "顶爆",
  "神了", "神仙", "封神", "封杀", "秒杀", "碾压", "血赚", "血亏",
  "太爽", "爽爆", "爽死", "泪目", "破大防", "破防了",
  // exclamations
  "天啊", "老天", "我天", "我的天", "妈呀", "哎呀", "哇塞", "哇哦",
  "厉害", "太厉害", "牛逼死了", "无敌", "恐怖", "可怕",
  // curses toward target
  "杀了", "打死", "干掉", "弄死", "爆锤", "爆哭", "哭死",
];

const MEDIUM_AROUSAL_TOKENS = [
  "真的", "确实", "居然", "竟然", "简直", "完全", "彻底", "根本",
  "非常", "特别", "尤其", "格外", "分外",
  "生气", "愤怒", "难过", "开心", "高兴", "兴奋", "激动", "心疼",
  "受伤", "委屈", "无奈", "郁闷",
];

const LOW_AROUSAL_TOKENS = [
  "还行", "还好", "一般", "凑合", "就那样", "无所谓", "都可以",
  "都行", "随便", "OK", "ok", "嗯", "哦", "啊", "吧",
  "平静", "平淡", "淡然", "冷静", "理性", "客观",
  "不过", "不太", "不是很", "不算", "谈不上",
];

/** Punctuation-based excitement heuristics. */
function punctBoost(text: string): number {
  let b = 0;
  if (/[!！]{2,}/.test(text)) b += 0.15;
  else if (/[!！]/.test(text)) b += 0.05;
  if (/[?？]{2,}/.test(text)) b += 0.08;
  // Whisper transcripts rarely have exclamations at all — this mostly kicks
  // in when we later feed real user text via other channels.
  return b;
}

function countHits(text: string, tokens: string[]): number {
  let n = 0;
  for (const t of tokens) {
    let idx = 0;
    while ((idx = text.indexOf(t, idx)) !== -1) {
      n += 1;
      idx += t.length;
    }
  }
  return n;
}

export function keywordArousal(input: LLMArousalInput): ArousalResult {
  const text = (input.transcript ?? "").trim();
  if (!text) {
    return { arousal: 0.35, reason: "keyword-fallback: empty" };
  }

  const high = countHits(text, HIGH_AROUSAL_TOKENS);
  const med = countHits(text, MEDIUM_AROUSAL_TOKENS);
  const low = countHits(text, LOW_AROUSAL_TOKENS);

  // Normalize per ~10 char density so long segments aren't unfairly boosted.
  const per10 = 10 / Math.max(text.length, 10);

  // Base score anchored at 0.4; each hit shifts the needle.
  let score = 0.4;
  score += Math.min(0.5, high * 0.14 * per10 * 10);  // strong pull toward high
  score += Math.min(0.15, med * 0.05 * per10 * 10);
  score -= Math.min(0.35, low * 0.09 * per10 * 10);  // pull toward low
  score += punctBoost(text);

  score = Math.max(0, Math.min(1, score));

  const reason =
    high > 0
      ? `含 ${high} 处激烈词`
      : low > 0
      ? `含 ${low} 处平淡词`
      : med > 0
      ? `含 ${med} 处程度副词`
      : "无关键词命中";

  return { arousal: score, reason: `keyword: ${reason}` };
}
