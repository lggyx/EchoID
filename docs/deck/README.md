# EchoID · Roadshow Deck

3 分钟 hackathon roadshow 幻灯片。9 页,平均 20 秒一页。

三个版本,选一个用:

| 文件 | 转场 & 动画 | 适合场景 |
|---|---|---|
| [`EchoID-roadshow.pptx`](./EchoID-roadshow.pptx) | 静态 | 兼容性最好,任何软件都行 |
| [`EchoID-roadshow-v2.pptx`](./EchoID-roadshow-v2.pptx) | 每页 fade + 每个元素依次 fadeIn | 适合稳字体的演讲 |
| [`EchoID-roadshow-v3.pptx`](./EchoID-roadshow-v3.pptx) | **PowerPoint Morph / Keynote 神奇移动** | 最丝滑,推荐 |

- **原始截图**: [`screenshots/`](./screenshots) — 2880×1800 @2x

## v3 · Magic Move

核心元素跨页有相同的 shape name (`!!bg` / `!!pill` / `!!heroTitle` / `!!heroSubtitle` / `!!footerL` / `!!footerR`),PowerPoint 2016+ / Keynote / Google Slides 会自动做**位置、大小、透明度、旋转的插值动画**。

效果:
- **背景光晕**跨页不闪
- **顶部 pill** 从封面居中大字滑到左上角小 badge
- **hero 标题** 从封面 90pt 大字缩小移动到内容页
- **页码 footer** 数字平滑翻页
- 其他每页独立元素以 fade 淡入

不支持 Morph 的旧版软件会自动 fallback 到 `<p:fade>`,不会崩。

## 页面清单

| # | 主题 | 秒 |
|---|---|---|
| 1 | Cover · 你说话像谁? | 20 |
| 2 | Problem · 你没听见自己 | 20 |
| 3 | Flow · 20 秒 4 步 → 一张卡 | 25 |
| 4 | Demo · 落地页 | 20 |
| 5 | Demo · 录音 | 25 |
| 6 | Demo · 揭晓 | 20 |
| 7 | Demo · 完整卡片 + 雷达 | 25 |
| 8 | Model · 6 维 × 12 角色 | 20 |
| 9 | Try it · GitHub CTA | 15 |

## 重新生成

需要:
- `uv`（Python 依赖管理）
- Node 22+ 与 Chrome（截图用 puppeteer-core 驱动系统 Chrome）
- Dev 环境已跑起来:
  - Docker: `docker compose up`
  - 或 Apple `container`: `scripts/dev.sh up` + `scripts/dev.sh dev`

步骤:

```bash
# 1. 走一次真实 pipeline 获取 resultId + cardId
say -v Tingting -o /tmp/deck.aiff "深夜的时候我喜欢一个人坐在窗边"
ffmpeg -y -i /tmp/deck.aiff -ac 1 -ar 16000 /tmp/deck.wav
curl -X POST http://localhost:3000/api/analyze -F "audio=@/tmp/deck.wav" > /tmp/resp.json
RESULT_ID=$(python3 -c "import json;print(json.load(open('/tmp/resp.json'))['resultId'])")
CARD_ID=$(python3 -c "import json;print(json.load(open('/tmp/resp.json'))['cardId'])")

# 2. 截图
mkdir -p /tmp/echoid-deck && cd /tmp/echoid-deck
cp <repo>/scripts/deck/screenshot.mjs .
npm init -y >/dev/null && npm install puppeteer-core --silent
RESULT_ID=$RESULT_ID CARD_ID=$CARD_ID node screenshot.mjs

# 3. 拼静态 pptx
mkdir -p build && cp <repo>/scripts/deck/{build_deck.py,pyproject.toml} build/
cd build && uv sync && uv run python build_deck.py
# → /tmp/echoid-deck/EchoID-roadshow.pptx

# 4. 加 v2 fade 动画 (可选)
cp <repo>/scripts/deck/animate_deck.py .
uv run python animate_deck.py
# → docs/deck/EchoID-roadshow-v2.pptx

# 5. 加 v3 Morph 神奇移动 (可选)
cp <repo>/scripts/deck/morph_deck.py .
uv run python morph_deck.py
# → docs/deck/EchoID-roadshow-v3.pptx
```
