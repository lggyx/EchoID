# EchoID · Roadshow Deck

3 分钟 hackathon roadshow 幻灯片。9 页,平均 20 秒一页。

- **成品**: [`EchoID-roadshow.pptx`](./EchoID-roadshow.pptx) — 4.8 MB · 16:9 · Keynote / PowerPoint / Google Slides 都能打开
- **原始截图**: [`screenshots/`](./screenshots) — 2880×1800 @2x

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

# 3. 拼 pptx
mkdir -p build && cp <repo>/scripts/deck/{build_deck.py,pyproject.toml} build/
cd build && uv sync && uv run python build_deck.py
# → /tmp/echoid-deck/EchoID-roadshow.pptx
```
