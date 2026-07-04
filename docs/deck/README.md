# VBTI · 声音照妖镜 Roadshow Deck

3 分钟 hackathon roadshow 幻灯片。9 页 · 每页平均 20 秒。

## 三个版本

| 文件 | 转场 & 动画 | 适合 |
|---|---|---|
| [`VBTI-roadshow.pptx`](./VBTI-roadshow.pptx) | 静态 · 无动画 | 兼容性最好,PowerPoint / Keynote / Google Slides / WPS 全能 |
| [`VBTI-roadshow-v2.pptx`](./VBTI-roadshow-v2.pptx) | 每页 fade 转场 + 每元素依次 fadeIn | 128 个 entrance 动画,适合稳字体的演讲 |
| [`VBTI-roadshow-v3.pptx`](./VBTI-roadshow-v3.pptx) | **PowerPoint Morph** 转场 (Keynote 神奇移动等价) | 最丝滑,推荐 · 支持 PowerPoint 2016+ / Keynote |

## 9 页大纲

| # | 主题 | ~秒 |
|---|---|---|
| 1 | Cover · 声音照妖镜 · 60 秒声学取证 | 20 |
| 2 | Problem · 你嘴上很稳,声音已经在报警 | 20 |
| 3 | Flow · 5 案发现场 → 1 张判决书 | 25 |
| 4 | Demo · 档案室入口 (landing) | 20 |
| 5 | Demo · 5 案发现场 (录音页) | 25 |
| 6 | Demo · 取证中 · 悬念揭晓 (result reveal) | 20 |
| 7 | Demo · 判决书 (声音暴露指数 + 罪证) | 25 |
| 8 | Model · 5 语系 × 7 人格 = 35 张卡 | 20 |
| 9 | Try it · GitHub CTA + 技术栈 | 15 |

## 视觉语言

沿用生产 UI 的 VBTI dark-detective 主题:

- 深色档案室背景 `#1A1A1A` + 铜金 spotlight
- 铁锈红 `#C44B2F` 主强调色 · 铜金 `#E8B87A` 边框和 mono label
- 做旧纸卡 `#F5F0E8` (aged-paper) · 深色黑板 (blackboard) · 红章 (已实锤)
- 每页顶部 `EXHIBIT · Nº XX` copper-outlined 标签 + 页脚 CASE FILE mono meta

## 附带的截图

[`screenshots/`](./screenshots) — 6 张实机截图 (2880 × 1800..4966 @2x)。都来自真实 VBTI 生产 UI:

- 01 · landing (2880 × 2590)
- 02 · record-intro (2880 × 2474)
- 03 · result-reveal · 取证中阶段 (2880 × 1800)
- 04 · result-full · 判决书完整视图 (2880 × 4966,长页)
- 05 · share · 判决书分享落地 (2880 × 2318)
- 06 · personas · 35 张卡池预览 (2880 × 4254,长页)

## 重新生成

需要:
- `uv` (Python 环境管理)
- Node 22+ 与 Chrome (puppeteer-core 驱动系统 Chrome 截图)
- Dev 环境已跑起来:
  - `docker compose up` 或
  - Apple `container`: `scripts/dev.sh up` + `scripts/dev.sh dev`

流程:

```bash
# 1. 走一次真实 5 段 pipeline 获取 resultId + cardId
for i in 1 2 3 4 5; do
  say -v Tingting -o /tmp/deck_q$i.aiff "<第 i 题的台词>"
  ffmpeg -y -i /tmp/deck_q$i.aiff -ac 1 -ar 16000 /tmp/deck_q$i.wav
done
curl -X POST http://localhost:3000/api/analyze \
  -F 'meta={"questionCount":5,"stageDirection":"female"}' \
  -F "audio=@/tmp/deck_q1.wav" -F "audio=@/tmp/deck_q2.wav" \
  -F "audio=@/tmp/deck_q3.wav" -F "audio=@/tmp/deck_q4.wav" \
  -F "audio=@/tmp/deck_q5.wav" > /tmp/resp.json
RESULT_ID=$(python3 -c "import json;print(json.load(open('/tmp/resp.json'))['resultId'])")
CARD_ID=$(python3 -c "import json;print(json.load(open('/tmp/resp.json'))['cardId'])")

# 2. 截图 (6 张 · 覆盖 landing/record/result-reveal/result-full/share/personas)
mkdir -p /tmp/echoid-deck && cd /tmp/echoid-deck
cp <repo>/scripts/deck/screenshot.mjs .
npm init -y >/dev/null && npm install puppeteer-core --silent
RESULT_ID=$RESULT_ID CARD_ID=$CARD_ID node screenshot.mjs

# 3. 拼静态 pptx
mkdir -p build && cp <repo>/scripts/deck/{build_deck.py,pyproject.toml} build/
cd build && uv sync && uv run python build_deck.py
# → docs/deck/VBTI-roadshow.pptx

# 4. 加 v2 fade 动画
cp <repo>/scripts/deck/animate_deck.py .
# (edit SRC/DST paths at the top to point at VBTI-roadshow.pptx / VBTI-roadshow-v2.pptx)
uv run python animate_deck.py

# 5. 加 v3 Morph 神奇移动
cp <repo>/scripts/deck/morph_deck.py .
# (edit SRC/DST paths)
uv run python morph_deck.py
```

或直接跑一体脚本:

```bash
cd /tmp/echoid-deck/build
cp <repo>/scripts/deck/{build_deck,animate_deck,morph_deck}.py .
# make_v2_v3.py orchestrates both post-processors
uv run python <repo>/scripts/deck/make_deck.py  # if present
```
