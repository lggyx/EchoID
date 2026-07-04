# EchoID

> 对着麦克风说 20–30 秒,EchoID 用真实声学特征为你画出一张"说话风格卡片",用角色比喻告诉你——你说话像谁。

一个 MVP：Next.js 14 全栈 + 本地 faster-whisper ASR + 六维声学打分 + 12 角色向量匹配 + 可分享卡片。

## Stack

| 层 | 选择 |
|---|---|
| App | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| DB | SQLite via Prisma |
| ASR | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) `small` (CTranslate2, int8, CPU) as a FastAPI sidecar |
| LLM / Image | Provider abstraction with mock implementations for MVP |
| 声学特征 | 纯 Node 侧：ffmpeg 解码 → YIN F0 + Meyda RMS + 能量 VAD → 14 维特征 |
| 主题 | reactbits.dev 风格深紫黑 + Bricolage Grotesque |

## 目录

```
src/
├── app/                    # Next.js pages + API routes
│   ├── page.tsx            # landing hero
│   ├── record/             # recording + waveform
│   ├── result/[resultId]/  # reveal + full card
│   ├── s/[cardId]/         # public share landing
│   ├── debug/roles/        # dev-only role poster gallery
│   └── api/
│       ├── analyze/        # POST audio → partial; GET full
│       ├── card/[cardId]/
│       ├── share/          # composes SVG share image + QR
│       ├── storage/[...path]/  # safe static file server
│       └── cleanup/        # TTL GC
├── components/             # UI + card renderer
├── lib/
│   ├── features/           # ffmpeg decode + YIN + RMS + VAD
│   ├── scoring/            # rule-based six-dimension scorer
│   ├── roles/              # 12-role library + weighted matcher
│   ├── providers/          # ASR / LLM / Image abstractions + mocks
│   ├── pipeline.ts         # end-to-end orchestrator
│   └── storage.ts
└── types/core.ts           # shared contracts

services/asr/               # Python microservice (uv + FastAPI + faster-whisper)
docs/
├── PRD.md                  # product requirements
└── DEV_CONTAINER.md        # container/proxy dev setup
```

## Quick start (containerized)

Requires macOS 15+ with Apple `container` CLI. See `docs/DEV_CONTAINER.md` for details.

```bash
scripts/dev.sh bridge      # host proxy bridge (loopback → NAT gateway)
scripts/dev.sh build       # build echoid-dev image (Node)
scripts/dev.sh build-asr   # build echoid-asr image (Python + faster-whisper)
scripts/dev.sh up          # start bridge + asr sidecar
scripts/dev.sh dev         # run `npm run dev`, publish :3000
```

Open <http://localhost:3000>.

Model files (`Systran/faster-whisper-small`, ~464 MB) are read-only-mounted from the host at `~/.cache/huggingface`, so nothing is re-downloaded.

## Debug mode

Toggle via URL: `?debug=1` on / `?debug=0` off (persists in `localStorage`).

Currently on by default in dev. Shows a live overlay of:
- Recording page: RMS, peak, spectral centroid, FPS
- Result page: 6-dim scores, 14 acoustic features, matched role

## Provider switch

`.env`:
```
ASR_PROVIDER=fasterwhisper   # or `mock`
LLM_PROVIDER=mock
IMAGE_PROVIDER=mock
```

The `Provider` interfaces in `src/types/core.ts` are the contract; add real
implementations behind the same interface — no call-site changes needed.

## Non-goals (v1)

Per PRD: no personality/MBTI labels, no pronunciation coaching, no content
opinion analysis.
