// 12 role templates for EchoID matching (PRD §3.3).
// Each role has a `center` vector in the six-dimension space (values 0..100)
// against which a user's dimension scores are compared via weighted Euclidean
// distance in match.ts.
//
// imagePromptTemplate placeholders:
//   {{tempo}}          → "low" | "mid" | "high" descriptor for pacing
//   {{expressiveness}} → "low" | "mid" | "high" descriptor for emotional range
// The LLM stage fills these before handing the string to the image provider.

import type { RoleTemplate } from "@/types/core";

export const ROLE_LIBRARY: RoleTemplate[] = [
  {
    id: "late_night_radio_host",
    title: "深夜电台主持人",
    persona: "把话说得像盖上一层薄毯，慢而有温度。",
    center: {
      thinking_tempo: 20,
      emotional_expressiveness: 25,
      presence: 70,
      decision_style: 70,
      communication_style: 35,
      thinking_depth: 65,
    },
    imagePromptTemplate:
      "editorial illustration, silhouette by a warm-lit vintage microphone, deep indigo night, soft amber glow, {{tempo}} rhythm, {{expressiveness}} emotion, cinematic",
    themeColor: "#2A2350",
  },
  {
    id: "rapid_lecturer",
    title: "连珠炮讲师",
    persona: "语速像子弹上膛，一句接一句地把逻辑塞满。",
    center: {
      thinking_tempo: 90,
      emotional_expressiveness: 55,
      presence: 60,
      decision_style: 75,
      communication_style: 55,
      thinking_depth: 55,
    },
    imagePromptTemplate:
      "editorial illustration, energetic teacher at a chalkboard, motion streaks, crisp geometric layout, {{tempo}} rhythm, {{expressiveness}} emotion, editorial poster style",
    themeColor: "#E4572E",
  },
  {
    id: "neighbor_chatter",
    title: "邻家闲聊者",
    persona: "话头一开就热络，像楼道里遇见的老朋友。",
    center: {
      thinking_tempo: 55,
      emotional_expressiveness: 70,
      presence: 40,
      decision_style: 35,
      communication_style: 85,
      thinking_depth: 35,
    },
    imagePromptTemplate:
      "editorial illustration, friendly figure leaning on a sunlit doorway, pastel warm tones, {{tempo}} rhythm, {{expressiveness}} emotion, cozy magazine cover",
    themeColor: "#F4A261",
  },
  {
    id: "steady_decision_maker",
    title: "稳健决策者",
    persona: "话不多，但每一句都是收口的。",
    center: {
      thinking_tempo: 50,
      emotional_expressiveness: 35,
      presence: 80,
      decision_style: 90,
      communication_style: 40,
      thinking_depth: 60,
    },
    imagePromptTemplate:
      "editorial illustration, figure standing at a wide desk with a single lit lamp, deep navy palette, {{tempo}} rhythm, {{expressiveness}} emotion, minimalist",
    themeColor: "#1B3A57",
  },
  {
    id: "poet_reader",
    title: "诗歌朗读者",
    persona: "把句子念得像浪拍岸，起伏有致。",
    center: {
      thinking_tempo: 35,
      emotional_expressiveness: 85,
      presence: 55,
      decision_style: 55,
      communication_style: 50,
      thinking_depth: 70,
    },
    imagePromptTemplate:
      "editorial illustration, figure reading by a window, drifting paper leaves, watercolor washes, {{tempo}} rhythm, {{expressiveness}} emotion, lyrical mood",
    themeColor: "#8A5A9A",
  },
  {
    id: "standup_performer",
    title: "脱口秀选手",
    persona: "节奏像鼓点，情绪甩到台前接住笑声。",
    center: {
      thinking_tempo: 80,
      emotional_expressiveness: 85,
      presence: 65,
      decision_style: 70,
      communication_style: 75,
      thinking_depth: 45,
    },
    imagePromptTemplate:
      "editorial illustration, spotlit performer with a stand mic, bold red backdrop, dynamic pose, {{tempo}} rhythm, {{expressiveness}} emotion, poster art",
    themeColor: "#D7263D",
  },
  {
    id: "gentle_hollow",
    title: "温柔树洞",
    persona: "语速慢，声音轻，听的时候比说的时候多。",
    center: {
      thinking_tempo: 25,
      emotional_expressiveness: 35,
      presence: 25,
      decision_style: 40,
      communication_style: 60,
      thinking_depth: 45,
    },
    imagePromptTemplate:
      "editorial illustration, small figure inside a hollowed tree, warm firefly lights, soft mint palette, {{tempo}} rhythm, {{expressiveness}} emotion, tender",
    themeColor: "#A8C3A0",
  },
  {
    id: "boardroom_speaker",
    title: "会议室发言人",
    persona: "开口就把气场压住，条理清清爽爽。",
    center: {
      thinking_tempo: 55,
      emotional_expressiveness: 40,
      presence: 75,
      decision_style: 80,
      communication_style: 45,
      thinking_depth: 70,
    },
    imagePromptTemplate:
      "editorial illustration, sharp figure at a long boardroom table, clean grid backdrop, cool grey-blue palette, {{tempo}} rhythm, {{expressiveness}} emotion, corporate editorial",
    themeColor: "#3E5C76",
  },
  {
    id: "curious_asker",
    title: "好奇提问家",
    persona: "尾音总是轻轻扬起，像随时把话递回给你。",
    center: {
      thinking_tempo: 65,
      emotional_expressiveness: 75,
      presence: 45,
      decision_style: 25,
      communication_style: 80,
      thinking_depth: 40,
    },
    imagePromptTemplate:
      "editorial illustration, figure surrounded by floating question marks and paper planes, sunny yellow palette, {{tempo}} rhythm, {{expressiveness}} emotion, playful",
    themeColor: "#F6BD60",
  },
  {
    id: "deep_philosopher",
    title: "深潜思考者",
    persona: "句子长而慢，停顿里藏着推理的路径。",
    center: {
      thinking_tempo: 25,
      emotional_expressiveness: 30,
      presence: 60,
      decision_style: 55,
      communication_style: 30,
      thinking_depth: 90,
    },
    imagePromptTemplate:
      "editorial illustration, figure walking a dim library corridor with tall shelves, deep teal palette, {{tempo}} rhythm, {{expressiveness}} emotion, contemplative",
    themeColor: "#264653",
  },
  {
    id: "cheerleader",
    title: "元气啦啦队",
    persona: "情绪冲在前面，节奏和音量都往上顶。",
    center: {
      thinking_tempo: 85,
      emotional_expressiveness: 90,
      presence: 55,
      decision_style: 60,
      communication_style: 85,
      thinking_depth: 30,
    },
    imagePromptTemplate:
      "editorial illustration, figure mid-cheer with confetti bursts, bright coral and sky-blue palette, {{tempo}} rhythm, {{expressiveness}} emotion, uplifting poster",
    themeColor: "#FF7F50",
  },
  {
    id: "calm_narrator",
    title: "冷静叙述者",
    persona: "情绪稳，节奏稳，像一段可靠的旁白。",
    center: {
      thinking_tempo: 45,
      emotional_expressiveness: 30,
      presence: 65,
      decision_style: 75,
      communication_style: 45,
      thinking_depth: 60,
    },
    imagePromptTemplate:
      "editorial illustration, seated narrator with an open book, warm desk lamp, muted sage palette, {{tempo}} rhythm, {{expressiveness}} emotion, quiet",
    themeColor: "#6B8E7B",
  },
];
