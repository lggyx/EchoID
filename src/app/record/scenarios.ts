/**
 * 声音照妖镜 · 5 case scenes.
 *
 * Structure per PRD-VBTI-v1.1 §4A + user-provided design brief:
 *   Q1-Q3  高压防守 → 反差率关键题（嘴上稳、声音破防）
 *   Q4     破防吐槽 → 抓马浓度唯一激活点
 *   Q5     戏路测试 → z1/z3 + 变声能力
 *
 * Field notes:
 * - `caseId` is 01..05, printed on the scene card as "案发现场 NN".
 * - `title` is the short name shown on the landing page menu.
 * - `situation` is the multi-line scene setup the user reads aloud.
 * - `prompt` is the quoted line the "other person" says — rendered on
 *   the aged-paper card in a distinct block so it feels like a witness
 *   statement being handed to the player.
 * - `hints` are 2-3 short lines shown right below the prompt so the
 *   user knows how to answer (what to focus on, what to avoid, and
 *   how it will be scored). These are visible during the brief AND
 *   during recording so users can glance if they blank.
 * - `duration` is the target answer length in seconds (matches PRD).
 * - `metric` is the short label surfaced on the case-file menu telling
 *   the player which dimension this question probes.
 * - `stageOptions` (only Q5) list the戏路 preset lines.
 * - `stageHints` (only Q5) show up after a戏路 is picked, before
 *   recording — how to actually pull off the 3-act line switch.
 */
export interface StageOption {
  id: "male" | "female" | "random";
  label: string;
  hint: string;
}

export interface Scenario {
  caseId: string;
  title: string;
  question: string;
  situation: string[];
  prompt: string;
  hints: string[];
  duration: number;
  metric: string;
  hasStageDirection?: boolean;
  stageOptions?: StageOption[];
  actLines?: { role: string; tone: string; text: string }[];
  stageHints?: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    caseId: "01",
    title: "机会争夺战",
    question: "为什么我们要选你？",
    situation: [
      "你想进一个很热门的项目组、实习组或社团核心组。",
      "负责人看着你说：",
    ],
    prompt: "想进来的人很多。你觉得我们为什么要选你？",
    hints: [
      "直接说 2-3 个优势,别客套。",
      "越像真的在面试,反差信号越准。",
      "别念稿,自然口语就行。",
    ],
    duration: 12,
    metric: "汇报伪装度 · 场面话浓度 · 人设包装",
  },
  {
    caseId: "02",
    title: "DDL 救火",
    question: "你先帮我顶一下吧。",
    situation: [
      "明天就要交作业 / 项目 / 汇报了。",
      "队友突然发来一句：",
    ],
    prompt: "我这部分还没做完,你先帮我顶一下吧,反正你比较会。",
    hints: [
      "就像真的在给对方发语音回复。",
      "答应还是拒绝都可以,重点是嘴上体面。",
      "情绪越憋越好,系统听得见你在忍。",
    ],
    duration: 12,
    metric: "嘴上体面 · 声音有没有报警",
  },
  {
    caseId: "03",
    title: "公开甩锅",
    question: "这块是 ta 负责的。",
    situation: [
      "小组汇报 / 项目复盘出了问题。",
      "对方当着老师 / leader / 负责人的面说：",
      "\u3000\u3000\u201c这块是 ta 负责的\u3002\u201d",
      "但其实根本不是你负责的。",
    ],
    prompt: "被冤枉了。用 10 秒回应,别露馅。",
    hints: [
      "对场景里的其他人说话,不是对系统。",
      "冷静解释、反问、澄清都可以。",
      "越装稳,反差率越可能爆表。",
    ],
    duration: 10,
    metric: "反差率关键题 · 冷静解释还是声音发抖",
  },
  {
    caseId: "04",
    title: "本命塌房现场",
    question: "官方把你本命写崩了。",
    situation: [
      "你追了很久的番 / 游戏 / 漫画突然更新。",
      "官方把你最喜欢的角色写崩了,或者直接刀了。",
      "给你的同担发一条 12 秒语音,吐槽这件事。",
    ],
    prompt: "不用理性分析。就当你真的在给同担发语音。",
    hints: [
      "放开骂、破防、抓马都欢迎,越夸张越好。",
      "这题不是防守,是唯一让抓马浓度拉满的题。",
      "口头禅、语气词、加重音都会被听见。",
    ],
    duration: 12,
    metric: "抓马浓度激活点 · 本命破防值",
  },
  {
    caseId: "05",
    title: "三秒入戏",
    question: "连演三个角色。",
    situation: [
      "最后一题,请连续演 3 个角色。",
      "每一句都要换一种语气。",
    ],
    prompt: "选一条戏路,然后按剧本连念三句。",
    hints: [
      "先在下方选一条戏路(男主 / 女主 / 盲盒)。",
      "选完会显示 3 句台词,按顺序念,每句换一种语气。",
      "不用背,可以边看边说。中间别停顿超过 2 秒。",
    ],
    duration: 14,
    metric: "入戏速度 · 变声能力 · 中二释放度",
    hasStageDirection: true,
    stageOptions: [
      { id: "male", label: "男主视角", hint: "反派 / 男友 / 叛逆少年" },
      { id: "female", label: "女主视角", hint: "反派 / 温柔男友 / 叛逆少女" },
      { id: "random", label: "抽盲盒", hint: "系统随机拼三种 tone" },
    ],
    actLines: [
      { role: "冷酷反派", tone: "低音、慢速、压迫感", text: "你以为这样就能赢我吗？" },
      { role: "治愈系同担", tone: "温软、鼓励", text: "没关系,今天也已经很努力了。" },
      { role: "中二少年 / 少女", tone: "高音、上头", text: "封印解除！现在轮到我登场了！" },
    ],
    stageHints: [
      "按 幕 1 → 幕 2 → 幕 3 顺序念,别打乱。",
      "每句之间要立刻换语气,别停顿太久。",
      "反派压嗓、治愈系柔一点、中二拉满,变声越大越好。",
    ],
  },
];

export const TOTAL_DURATION_SECONDS = SCENARIOS.reduce((s, c) => s + c.duration, 0); // 60
