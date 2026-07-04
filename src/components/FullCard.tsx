"use client";

import { useMemo, useState } from "react";
import type {
  AnalyzeFullResponse,
  Dimension,
  DimensionKey,
} from "@/types/core";
import DebugOverlay, { type DebugSection } from "@/components/DebugOverlay";
import { useDebugMode } from "@/lib/debug";
import GradientText from "@/components/GradientText";

const DIM_LABEL: Record<DimensionKey, string> = {
  thinking_tempo: "思维节奏",
  emotional_expressiveness: "情绪外显度",
  presence: "气场",
  decision_style: "决策模式",
  communication_style: "沟通风格",
  thinking_depth: "思维深度",
};

// Canonical axis order — this is what the radar draws around the hexagon.
const AXIS_ORDER: DimensionKey[] = [
  "thinking_tempo",
  "emotional_expressiveness",
  "presence",
  "decision_style",
  "communication_style",
  "thinking_depth",
];

type ShareResponse = {
  cardId: string;
  shareImageUrl: string;
  shareUrl: string;
};

export default function FullCard({
  full,
  resultId,
}: {
  full: AnalyzeFullResponse;
  resultId?: string;
}) {
  const debug = useDebugMode();
  const [openKey, setOpenKey] = useState<DimensionKey | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareErr, setShareErr] = useState<string>("");
  const [share, setShare] = useState<ShareResponse | null>(null);

  // Index dimensions by key so we can render in canonical axis order even
  // if the backend returns them shuffled.
  const dimByKey = useMemo(() => {
    const m = new Map<DimensionKey, Dimension>();
    for (const d of full.dimensions) m.set(d.key, d);
    return m;
  }, [full.dimensions]);

  const doShare = async () => {
    setSharing(true);
    setShareErr("");
    try {
      const res = await fetch(`/api/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resultId: resultId ?? null,
          cardId: full.cardId ?? null,
        }),
      });
      if (!res.ok) throw new Error(`生成分享图失败 (${res.status})`);
      const data = (await res.json()) as ShareResponse;
      setShare(data);
    } catch (err) {
      setShareErr(err instanceof Error ? err.message : "生成失败");
    } finally {
      setSharing(false);
    }
  };

  const debugSections: DebugSection[] = debug
    ? [
        {
          title: "matched",
          rows: [
            ["role_title", full.roleTitle],
            ["headline", full.headline],
            ["result_id", resultId ?? "-"],
            ["card_id", full.cardId ?? "-"],
          ],
        },
        {
          title: "dimensions (0..100)",
          rows: full.dimensions.map(
            (d): [string, string | number] => [
              `${DIM_LABEL[d.key] ?? d.key}`,
              `${Math.round(d.score)}  ${d.levelLabel}`,
            ],
          ),
        },
        {
          title: "acoustic features",
          rows: acousticRows(full.features),
        },
        {
          title: "raw features JSON",
          json: full.features,
        },
      ]
    : [];

  return (
    <article className="flex flex-col gap-6 pb-16 animate-fade-up">
      {debug && <DebugOverlay sections={debugSections} />}
      {/* Hero image */}
      <div className="w-full aspect-square rounded-3xl overflow-hidden grad-border bg-surface">
        {full.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={full.imageUrl}
            alt={full.roleTitle}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted text-sm">
            无图
          </div>
        )}
      </div>

      {/* Headline block */}
      <header className="text-center flex flex-col gap-3">
        <div className="font-mono text-[10px] tracking-[0.3em] text-subtle">
          YOU SOUND LIKE
        </div>
        <h1 className="font-display font-medium text-4xl leading-tight">
          <GradientText as="span">{full.roleTitle}</GradientText>
        </h1>
        <p className="text-sm text-muted leading-relaxed">{full.headline}</p>
      </header>

      {/* Radar */}
      <section className="flex flex-col items-center gap-3">
        <div className="font-mono text-[10px] tracking-[0.3em] text-subtle">
          6-D RADAR
        </div>
        <Radar
          scores={AXIS_ORDER.map((k) => dimByKey.get(k)?.score ?? 0)}
          labels={AXIS_ORDER.map((k) => DIM_LABEL[k])}
        />
      </section>

      {/* Dimension rows */}
      <section className="flex flex-col divide-y divide-line/60 rounded-2xl bg-surface/70 backdrop-blur-sm grad-border">
        {AXIS_ORDER.map((k) => {
          const d = dimByKey.get(k);
          if (!d) return null;
          const open = openKey === k;
          return (
            <div key={k}>
              <button
                onClick={() => setOpenKey(open ? null : k)}
                className="w-full flex items-center justify-between px-4 py-4 text-left"
                aria-expanded={open}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] tracking-[0.2em] text-subtle uppercase">
                    {DIM_LABEL[k]}
                  </div>
                  <div className="font-medium text-base truncate text-ink">
                    {d.levelLabel}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <ScoreBar score={d.score} />
                  <span className="tabular-nums text-sm w-8 text-right text-ink font-mono">
                    {Math.round(d.score)}
                  </span>
                  <span
                    className={`text-muted transition-transform ${
                      open ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  >
                    ▾
                  </span>
                </div>
              </button>
              {open && (
                <div className="px-4 pb-4 -mt-1 text-sm text-ink/80 leading-relaxed flex flex-col gap-2 animate-fade-up">
                  <p>{d.oneLiner}</p>
                  <p className="text-xs text-subtle font-mono">
                    EVIDENCE · {d.evidenceMetric}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Share */}
      <section className="flex flex-col gap-3">
        {!share ? (
          <button
            onClick={doShare}
            disabled={sharing}
            className="w-full rounded-full bg-grad-primary bg-[length:200%_200%] animate-gradient-shift text-canvas py-4 text-base font-semibold shadow-glow active:scale-[0.98] transition disabled:opacity-60"
          >
            {sharing ? "生成中…" : "生成分享图"}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="w-full rounded-2xl overflow-hidden border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={share.shareImageUrl}
                alt="分享图"
                className="w-full h-auto"
              />
            </div>
            <a
              href={share.shareImageUrl}
              download
              className="w-full text-center rounded-full bg-ink text-canvas py-3 text-sm font-medium"
            >
              保存分享图
            </a>
            <a
              href={share.shareUrl}
              className="w-full text-center rounded-full border border-line py-3 text-sm text-ink"
            >
              打开分享页
            </a>
          </div>
        )}
        {shareErr && (
          <p className="text-xs text-rose-400 text-center">{shareErr}</p>
        )}
        <p className="text-[11px] text-subtle text-center leading-relaxed font-mono">
          分析基于本次录音的声学特征 · 结果仅供娱乐参考
        </p>
      </section>
    </article>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="w-16 h-1.5 rounded-full bg-line overflow-hidden">
      <div
        className="h-full bg-grad-primary bg-[length:200%_200%] animate-gradient-shift"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function acousticRows(
  f: AnalyzeFullResponse["features"],
): [string, string | number][] {
  // Compact human-friendly units. The full JSON blob is in a separate section.
  return [
    ["duration", `${f.duration.toFixed(1)}s`],
    ["语速", `${f.speechRate.toFixed(2)} 字/s`],
    ["语速方差", f.speechRateVar.toFixed(3)],
    ["停顿数", f.pauseCount],
    ["平均停顿", `${f.pauseDurAvg.toFixed(2)}s`],
    ["停顿占比", `${(f.pauseRatio * 100).toFixed(1)}%`],
    ["F0 均值", `${f.f0Mean.toFixed(0)} Hz`],
    ["F0 标准差", `${f.f0Std.toFixed(1)} Hz`],
    ["F0 range", `${f.f0Range.toFixed(0)} Hz`],
    ["RMS 均值", f.rmsMean.toFixed(3)],
    ["RMS DR", f.rmsDr.toFixed(3)],
    ["句尾斜率", `${f.pitchSlopeEnd.toFixed(1)} Hz/s`],
    ["语气词率", `${f.fillerRate.toFixed(1)}/min`],
    ["TTR", f.ttr.toFixed(3)],
    ["平均句长", `${f.sentLen.toFixed(1)} 字`],
  ];
}

/**
 * 6-axis radar chart drawn as raw SVG.
 * - Reference hexagon at 50%.
 * - Semi-transparent accent-color polygon for the actual scores.
 * - Axis labels in Chinese around the outside.
 */
function Radar({ scores, labels }: { scores: number[]; labels: string[] }) {
  const SIZE = 280;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = 90; // max radius for score=100
  // Axis angles: start at top (-90°) then clockwise, 60° apart.
  const angles = Array.from({ length: 6 }, (_, i) => -Math.PI / 2 + (i * Math.PI) / 3);

  const pt = (r: number, i: number) => {
    const a = angles[i];
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
  };

  const polyPoints = (rs: number[]) =>
    rs.map((r, i) => pt(r, i).join(",")).join(" ");

  const reference = polyPoints(Array(6).fill(R * 0.5));
  const outer = polyPoints(Array(6).fill(R));
  const values = polyPoints(
    scores.map((s) => (Math.max(0, Math.min(100, s)) / 100) * R),
  );

  // Label placement — sit just outside the outer hexagon.
  const labelR = R + 22;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full max-w-[300px] h-auto"
      aria-label="六维雷达图"
    >
      <defs>
        <linearGradient id="radarGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#B37CFF" />
          <stop offset="60%" stopColor="#5EE7FF" />
          <stop offset="100%" stopColor="#FFA1E0" />
        </linearGradient>
        <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#B37CFF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#5EE7FF" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      {/* concentric hexagon grid at 25/50/75/100% */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={polyPoints(Array(6).fill(R * f))}
          fill="none"
          stroke="rgba(245,241,255,0.08)"
          strokeWidth={1}
        />
      ))}
      {/* axes */}
      {angles.map((_, i) => {
        const [x, y] = pt(R, i);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke="rgba(245,241,255,0.08)"
            strokeWidth={1}
          />
        );
      })}
      {/* reference 50% hexagon — subtle */}
      <polygon
        points={reference}
        fill="rgba(245,241,255,0.03)"
        stroke="rgba(245,241,255,0.14)"
        strokeDasharray="3 3"
      />
      {/* actual values */}
      <polygon
        points={values}
        fill="url(#radarFill)"
        stroke="url(#radarGrad)"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* value dots */}
      {scores.map((s, i) => {
        const [x, y] = pt((Math.max(0, Math.min(100, s)) / 100) * R, i);
        return <circle key={i} cx={x} cy={y} r={3} fill="#B37CFF" />;
      })}
      {/* outer outline for crispness */}
      <polygon points={outer} fill="none" stroke="rgba(245,241,255,0.15)" />
      {/* labels */}
      {labels.map((label, i) => {
        const a = angles[i];
        const x = CX + labelR * Math.cos(a);
        const y = CY + labelR * Math.sin(a);
        const cos = Math.cos(a);
        const anchor: "start" | "middle" | "end" =
          cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={11}
            fill="#F5F1FF"
            opacity={0.75}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
