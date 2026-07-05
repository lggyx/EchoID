# 声音照妖镜 · VBTI

> 说 60 秒话,VBTI 用**反差率**和**抓马浓度**两个可测声学指标,把你钉在一张"演艺人格卡"上——**你不是没在演,只是没意识到自己演得像谁**。

**VBTI** = Voice-BS Type Indicator。5 个案发现场,1 张判决书,35 张人格卡池。

系统只听声音,不问对错。ASR 转文本后 LLM 判"内容有多激动"(语义 arousal),DSP 从原始音频抽 F0 起伏 / 音量动态 / 峰值密度(声学 arousal),两者差就是**反差率**——你嘴上稳不稳,声音在不在报警。

- **PRD**: [`docs/PRD-VBTI-v1.1.md`](docs/PRD-VBTI-v1.1.md) · 单一权威依据
- **设计规范**: dark detective / archive-noir · 铁锈红 + 铜金 + 深褐灰
- **Roadshow deck**: [`docs/deck/`](docs/deck/) · 3 分钟 hackathon 版 · 4 种(静态 / fade / Morph / Magic-Move)

## Stack

| 层 | 选择 |
|---|---|
| App | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| DB | SQLite via Prisma |
| ASR | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) `small` (CTranslate2, int8, CPU) as a FastAPI sidecar |
| LLM | OpenAI chat-completions-compatible (e.g. gpt-5-chat-latest), `finish=length` 4× retry + keyword fallback |
| Image | 静态立绘查表 (35 VBTI + 12 legacy) under `public/personas/` |
| 声学特征 | 纯 Node 侧: ffmpeg 解码 → YIN F0 + Meyda RMS + energy VAD + peak-density / pause-regularity / burst-stops = 17 维 |
| 匹配 | 5-D Manhattan + 5 语系印记扳机 (`SIGNATURE_BONUS=0.30`) + 稀缺/兜底/常规最近邻 |
| 主题 | 手书行楷 + Noto Sans SC Heavy + JetBrains Mono, 铁锈金属 CTA, 做旧纸卡, 铜金铆钉 |

## 目录

```
src/
├── app/
│   ├── page.tsx                    # 档案室入口 (landing)
│   ├── record/                     # 5 案发现场录音 · Q5 戏路选择
│   │   ├── page.tsx                # state machine + waveform + upload
│   │   └── scenarios.ts            # 5 道情境题数据
│   ├── result/[resultId]/          # 取证中 → 揭晓 → 判决书
│   ├── s/[cardId]/                 # 公开判决书分享落地
│   ├── debug/roles/                # legacy dev-only 立绘 gallery
│   └── api/
│       ├── analyze/                # POST 5 段 → matchedSubsystem+persona
│       ├── card/[cardId]/          # GET 完整判决书
│       ├── share/                  # 合成 VBTI 分享 SVG + QR
│       ├── storage/[...path]/      # 安全静态文件服务
│       └── cleanup/                # TTL GC
├── components/
│   ├── FullCard.tsx                # 完整判决书视图
│   └── vbti/material.tsx           # AgedCard / Blackboard / Stamp / ExhibitTag / StatBar / ScanLine
├── lib/
│   ├── features/                   # extract / vbti (3 新特征) / pitch / rms / vad / decode / text
│   ├── scoring/                    # vbti (反差率 + 抓马浓度) / baselines / baselines.segment
│   ├── matching/                   # config (5 中心 + 5 扳机) / subsystem / persona
│   ├── personas/                   # personas.ts (数据驱动开放卡池) + images.ts (personaId→URL)
│   ├── providers/                  # ASR (fasterwhisper/mock) / LLM (openai-compatible/mock) / Image (static/mock)
│   ├── pipeline.ts                 # legacy 单段管线
│   └── pipeline-segmented.ts       # VBTI 5 段管线
└── types/core.ts                   # 全局契约 (§12.4)

services/asr/                       # Python microservice (uv + FastAPI + faster-whisper)
public/personas/                    # 立绘静态资产
├── *.png                           # 12 legacy EchoID 立绘
└── vbti/                           # 35 VBTI 立绘 (5 语系 × 7 人格)

docs/
├── PRD-VBTI-v1.1.md                # 唯一权威 PRD (三人分工 §12.2 定义于此)
├── PRD-VBTI.md                     # v1.0 归档 · 已被 v1.1 取代
├── PRD.md                          # EchoID v0.2 前身
├── phase-0-conclusion.md           # 反差率可行性 spike 结论 (Track A · Decision C)
├── DEV_CONTAINER.md                # 容器/代理开发环境说明
├── deck/                           # roadshow deck (4 版) + 讲稿 + 截图
└── vbti-personas-contact-sheet.png # 35 张 VBTI 立绘 contact sheet

scripts/
├── dev.sh                          # Apple `container` 一站式 (up/dev/asr/watchdog/status/stop)
├── asr_watchdog.sh                 # ASR sidecar 自愈守护 (Apple container 挂了自动 rerun)
├── proxy_bridge.py                 # 宿主机代理桥
├── phase-0-spike/                  # Track A · Phase 0 反差率 spike + 8 段测试音频
└── deck/                           # deck 截图 + 拼装 + morph/animate 后处理
```

## Quick start

**两种支持的开发环境, 二选一.**

### Docker Compose (推荐, 跨平台)

需要 Docker Engine 20.10+ 与 Compose v2.

```bash
docker compose up --build      # 一次构建 app + asr 两个镜像并启动
```

打开 <http://localhost:3000>. Node app 通过 Compose 私有网络访问 faster-whisper `http://asr:8000` — 不需要宿主机 tricks.

需要走代理:
```bash
cp docker-compose.override.example.yml docker-compose.override.yml
# 编辑代理 URL, 然后:
docker compose up --build
```

### Apple `container` CLI (macOS 15+)

Apple Silicon 上不用 Docker Desktop. 详见 [`docs/DEV_CONTAINER.md`](docs/DEV_CONTAINER.md).

```bash
scripts/dev.sh up          # bridge + asr + watchdog
scripts/dev.sh dev         # npm run dev · 发布到 :3000
scripts/dev.sh status      # 查看 4 个组件的健康状态
```

ASR 模型 (`Systran/faster-whisper-small`, ~464 MB) 从宿主机 `~/.cache/huggingface` 只读挂载,不重复下载.

### ASR sidecar 自愈

Apple `container` 不像 docker-compose 自动 restart. 长时间闲置 / macOS 睡眠 / vmnet 抖动后 sidecar 可能 stopped, pipeline 会抛 `fetch failed`.

`scripts/dev.sh up` 会同时启动 `scripts/asr_watchdog.sh` — 每 15 秒 ping `/healthz`, 连续 2 次失败自动 `scripts/dev.sh asr` 重启. Demo 时基本无感.

## API 契约

### `POST /api/analyze` (multipart)

**VBTI 5 段模式** (推荐):
```
meta = JSON.stringify({ questionCount: 5, stageDirection?: 'male'|'female'|'random' })
audio = <Blob>            // 重复 5 次, 顺序对应 Q1..Q5
```

**Legacy 单段模式** (向后兼容):
```
audio = <Blob>            // 单一 blob, 无 meta 字段
```

返回:
```jsonc
{
  "recordingId": "…",
  "resultId":    "…",
  "cardId":      "…",
  "headline":    "你演得像综艺组·氛围担当",
  "imageUrl":    "/personas/vbti/10_atmosphere_driver.png",
  "matchedSubsystem": "variety",
  "subsystemTitle":   "综艺组"
}
```

### `GET /api/analyze?resultId=<id>&full=1`

完整判决书: 反差率 / 抓马浓度 / z1-z3 / evidenceJson / segmentsSummary. 详见 `src/types/core.ts`.

### `POST /api/share` `{ resultId }` → 生成 VBTI 判决书分享 SVG (1080×1350)

深色档案室底 · 铜金框立绘 · 已实锤印章 · CASE FILE 头 · 声音照妖镜水印 · QR 码.

## Debug mode

URL 加 `?debug=1` 打开, `?debug=0` 关闭 (`localStorage` 持久化). Dev 默认开.

- 录音页浮层: RMS / 峰值 / 频谱质心 / FPS
- 结果页浮层: 5 语系 + 5 项声音暴露指数 + 17 特征 raw JSON

## Provider 切换

`.env`:
```bash
# ASR
ASR_PROVIDER=fasterwhisper                     # 或 mock

# LLM (OpenAI chat-completions 兼容)
LLM_BASE_URL=https://api.openai.com/v1         # 或任何兼容端点 (openai-next / DeepSeek / Moonshot / Groq / Ollama...)
LLM_API_KEY=<your-key>                         # 空 → 回退到 mock
LLM_MODEL=gpt-5-chat-latest                    # 必须是 chat 模型 (非 embedding, 非 thinking-only)

# Image
IMAGE_PROVIDER=static                          # 或 mock (仅开发时用于新加人格暂无图)
```

`src/types/core.ts` 是唯一 Provider 契约. 换供应商不改调用点.

## 反差率 / 抓马浓度 · 核心模型

**反差率** (PRD §2.1) = `|V_sem_arousal − V_ac_arousal| × 100 ∈ [0,100]`
- V_sem_arousal · LLM 从 ASR 文本抽的"内容激动度" ∈ [0,1]
- V_ac_arousal · `normalize(F0_std·w1 + RMS_dr·w2 + SR·w3 + SR_var·w4 + peak_density·w5)` ∈ [0,1]

**抓马浓度** (PRD §2.2) = `normalize(F0_std·0.35 + RMS_dr·0.35 + peak_density·0.30) × 100`

**5 语系** (PRD §4.2, 中心坐标见 `src/lib/matching/config.ts`):
影视组 · 综艺组 · 舞台组 · 机器人组 · 街头组

**开放卡池** (PRD §4.4): 35 张起步 (5×7), 加卡是纯数据操作 — 改 `src/lib/personas/personas.ts` 加一条 + `public/personas/vbti/` 放一张 PNG, 匹配算法不变.

## 三 Tracks 分工 (PRD §12.2)

VBTI 已合并 3 条 feature 分支到 master:

| Track | 主战场 | Phase | 状态 |
|---|---|---|---|
| **A** 声学/算法 | `lib/features/`, `lib/scoring/`, `lib/matching/`, `lib/personas/` | 0 · 反差率 spike · 2 · 3 新特征 · 4 · 5-D 匹配 · 6 · 冷启动校准 (⏳) | ✅ merged (PR #2) |
| **B** 前端/交互 | `app/{page,record,result,s}/`, `components/vbti/` | 5 · dark-detective UI + 5 幕录音 + 判决书 | ✅ merged (PR #4) |
| **C** 后端/数据/集成 | `lib/providers/`, `prisma/`, `lib/pipeline-segmented.ts`, `app/api/`, `public/personas/` | 1 · LLM + 静态图 · 1.5 · 35 立绘 · 3 · 5 段 API + Prisma | ✅ merged (PR #3) |

## Non-goals (v1)

PRD 明确:
- 不做 MBTI 心理评测,不给性格标签
- 不做发音矫正 / 口才培训
- 不评判"演戏"好坏
- 不做双人对比 / 实时 AI 对话
- **不承诺 valence 反差** (只做 arousal 单轴反差, 见 §2.1)
