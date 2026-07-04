#!/usr/bin/env bash
# Phase 0 · generate 8 Chinese synth clips for the contrast-rate spike.
#
# Uses macOS `say` + varied voices + rate + ffmpeg. Voice + rate maximize
# acoustic-arousal spread. Only voices actually installed on stock macOS are
# used — Grandpa / Reed / Eddy / Flo / Rocko etc need a manual download in
# System Settings → Accessibility → Spoken Content → System Voice → Manage.
# Fall back to Tingting (F, warm) / Meijia (F, brighter, HK-flavored) /
# Sinji (F, Cantonese, brighter still) which ship out of the box.
#
# Idempotent: skips clips that already exist.
set -euo pipefail

OUT_DIR="$(cd "$(dirname "$0")" && pwd)/audio"
mkdir -p "$OUT_DIR"

# id | voice | rate (WPM) | text
CLIPS=(
  "01_flat_shrug|Tingting|140|还行吧就那样也没什么特别的感觉一般般"        # LL: 慢, 淡
  "02_meltdown_rage|Sinji|260|主角死了我要杀了编剧真的绝了气死我了这什么破结局" # HH: 快, 亮
  "03_flat_calm_vent|Tingting|130|我觉得这次真的是特别过分特别不能接受的一件事情" # HL: 语烈但声慢
  "04_excited_boring|Meijia|250|今天午饭吃了番茄鸡蛋盖饭还挺好吃的价格也合适"   # LH: 声亮但语淡
  "05_baseline_report|Tingting|180|本季度的营收环比增长百分之八利润率保持稳定"  # mid
  "06_restrained_anger|Tingting|140|这块其实不是我负责的这个方案我完全没参与"    # HL: 声慢, 语烈
  "07_happy_uneventful|Tingting|190|周末去了公园散步天气特别好心情也不错"      # mid
  "08_ecstatic_praise|Sinji|265|这个产品简直太好用了我要疯了强推所有人都得试试"   # HH
)

for entry in "${CLIPS[@]}"; do
  IFS='|' read -r id voice rate text <<< "$entry"
  wav="$OUT_DIR/$id.wav"
  if [ -f "$wav" ]; then
    printf "  [skip] %s\n" "$id"
    continue
  fi
  aiff="/tmp/vbti_phase0_$id.aiff"
  say -v "$voice" -r "$rate" -o "$aiff" "$text"
  ffmpeg -hide_banner -loglevel error -y -i "$aiff" -ac 1 -ar 16000 "$wav"
  rm -f "$aiff"
  printf "  [ok ] %s  v=%s r=%s  dur=%.2fs  \"%s…\"\n" \
    "$id" "$voice" "$rate" \
    "$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$wav")" \
    "${text:0:24}"
done

echo
echo "audio dir: $OUT_DIR"
ls -1 "$OUT_DIR" | wc -l | xargs printf "%s clips ready\n"
