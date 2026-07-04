# VBTI · Phase 0 · Contrast-Rate Feasibility Spike — Conclusion

_Generated: 2026-07-04T13:19:17.245Z_

## Pass criteria (PRD §11)

| Criterion | Threshold | Actual | Verdict |
|---|---|---|---|
| Spread of contrast means | > 40 | **23.8** | ✗ PRD FAIL |
| Decision C continuation floor | >= 20 | **23.8** | ✓ CONTINUE |
| Worst-clip Δ stability | std < 5 | **3.68** | ✓ PASS |
| Mean Δ stability | — | 1.37 | — |
| LLM keyword-fallback rate | — | 0/8 clips | clean |

## Overall: **CONTINUE BY DECISION C ⚠**

Contrast rate missed the original PRD >40 spread threshold on macOS `say` TTS, but the team accepted **Decision C**: TTS is too flat for the original threshold, and spread >= 20 with stable reruns is enough to continue Phase 2 while recording the risk. Do not treat this as a strict PRD pass; treat it as an explicit threshold relaxation for the TTS spike.

## Per-clip data (3 runs each)

| clip | expected | sem̄ | ac̄ | Δ̄ | Δstd | stable | transcript |
|---|---|---|---|---|---|---|---|
| 01_flat_shrug | LL | 0.12 | 0.55 | 43.4 | 1.63 | ✓ | 還行吧就那樣也沒什麼特別的感覺一般般 |
| 02_meltdown_rage | HH | 0.97 | 0.60 | 36.9 | 0.47 | ✓ | 主角死了我要殺了天劇真的絕了氣死我了者什麼破結局 |
| 03_flat_calm_vent | HL | 0.84 | 0.57 | 26.8 | 0.00 | ✓ | 我覺得這次真的是特別過分特別不能接受的一件事情 |
| 04_excited_boring | LH | 0.25 | 0.72 | 46.4 | 1.89 | ✓ | 今天午飯吃了番茄雞蛋蓋飯還挺好吃的價格也合適 |
| 05_baseline_report | mid | 0.08 | 0.58 | 50.4 | 0.00 | ✓ | 本季度的營收環比增長8%利潤率保持穩定 |
| 06_restrained_anger | HL | 0.32 | 0.58 | 26.6 | 3.68 | ✓ | 这块其实不是我负责的这个方案我完全没参与 |
| 07_happy_uneventful | mid | 0.26 | 0.56 | 30.4 | 2.83 | ✓ | 周末去了公園散步天氣特別好心情也不錯 |
| 08_ecstatic_praise | HH | 0.95 | 0.54 | 40.7 | 0.47 | ✓ | 這個產品簡直太好用了我要封了強推所有人都得試試 |

## Reproducibility

```bash
container exec echoid-dev bash -lc \
  "cd /app && npx tsx --env-file=.env scripts/phase-0-spike/contrast-spike.ts"
```

## Notes for future readers

- Semantic arousal is extracted with a real chat LLM
  (`LLM_BASE_URL=https://api.openai-next.com/v1`, model
  `gpt-5-chat-latest`). On any LLM failure the runtime falls
  back to `keywordArousal`; that path is marked in each clip's summary.
- Acoustic arousal uses the **legacy 14-feature** formula
  (`f0Std / rmsDr / speechRate / speechRateVar`, no peak_density yet).
  Once Phase 2 adds peak_density and a proper VBTI baseline, re-run this
  spike and expect *higher* signal quality, not lower.
- Clips are macOS-`say` synth — a real deployment will see more diverse
  voices and content. Consider re-running with 3-5 real-human recordings
  once available.
