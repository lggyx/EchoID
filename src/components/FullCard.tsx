"use client";

import { useMemo, useState } from "react";
import type {
  AnalyzeFullResponse,
  AnalyzeSegmentedFullResponse,
  EvidenceItem,
} from "@/types/core";
import {
  AgedCard,
  Blackboard,
  CaseId,
  ChainDivider,
  CopperButton,
  ExhibitTag,
  RustButton,
  Stamp,
  StatBar,
} from "@/components/vbti/material";

/* ────────── payload discrimination ────────── */

type LegacyFull = AnalyzeFullResponse;
type VbtiFull = AnalyzeSegmentedFullResponse & { roleTitle?: string };
type AnyFull = LegacyFull | VbtiFull;

function isVbti(full: AnyFull): full is VbtiFull {
  return "matchedSubsystem" in full && !!(full as VbtiFull).matchedSubsystem;
}

type ShareResponse = {
  cardId: string;
  shareImageUrl: string;
  shareUrl: string;
};

/* ────────── helpers ────────── */

/** Strip "你演得像·..." prefix from a headline so we can render the persona
 *  name on its own. */
function stripYouSoundLike(s?: string): string {
  if (!s) return "";
  return s
    .replace(/^你演得像[·:：\s]*/u, "")
    .replace(/^YOU SOUND LIKE[·:：\s]*/iu, "")
    .trim();
}

/** Split cardCopy into 2 judgment lines by "。" — used in the aged-paper
 *  quote block. Falls back to the whole string. */
function splitJudgment(copy: string, headline: string): [string, string] {
  const src = (copy || headline || "").trim();
  if (!src) return ["", ""];
  const parts = src
    .split(/[。！？!?]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return [parts[0] + "。", parts.slice(1).join("。") + "。"];
  return [parts[0] || src, ""];
}

/** Coerce whatever `evidenceJson` came back as into an EvidenceItem[]. It
 *  can be null (older DB rows), a `{evidence: [...]}` wrapper, or already
 *  a bare array. */
function coerceEvidence(raw: unknown): EvidenceItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as EvidenceItem[];
  if (typeof raw === "object") {
    const r = raw as { evidence?: unknown };
    if (Array.isArray(r.evidence)) return r.evidence as EvidenceItem[];
  }
  return [];
}

/** Synthesize exhibits from segmentsSummary when evidenceJson is empty —
 *  we grab whichever three segments have the highest drama density and
 *  distill each into a one-line "abstract". */
function synthesizeExhibits(
  segments: VbtiFull["segmentsSummary"],
): EvidenceItem[] {
  return [...segments]
    .sort((a, b) => (b.dramaDensity ?? 0) - (a.dramaDensity ?? 0))
    .slice(0, 3)
    .map((s, i) => ({
      key: `synth_${i}`,
      label: `第 ${s.questionIndex} 题`,
      value: Math.round(s.dramaDensity ?? 0),
      unit: "%",
      segmentIndex: s.questionIndex,
      text:
        (s.transcript || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60) || "(无 transcript)",
    }));
}

const EXHIBIT_LETTERS = ["A", "B", "C", "D"];

/* ═══════════════════════════════════════════════════════════════════════
 *  Main
 * ═══════════════════════════════════════════════════════════════════════ */

export default function FullCard({
  full,
  resultId,
}: {
  full: AnyFull;
  resultId?: string;
}) {
  const [sharing, setSharing] = useState(false);
  const [shareErr, setShareErr] = useState<string>("");
  const [share, setShare] = useState<ShareResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const shortId = useMemo(
    () => (resultId ?? full.resultId ?? "").slice(0, 6).toUpperCase() || "??????",
    [resultId, full.resultId],
  );

  const doShare = async () => {
    setSharing(true);
    setShareErr("");
    try {
      const res = await fetch(`/api/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resultId: resultId ?? full.resultId ?? null,
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

  const doCopyLink = async () => {
    const url =
      typeof window !== "undefined" && full.cardId
        ? `${window.location.origin}/s/${full.cardId}`
        : "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* silent — clipboard perms can vary. */
    }
  };

  const doSystemShare = async () => {
    const url =
      typeof window !== "undefined" && full.cardId
        ? `${window.location.origin}/s/${full.cardId}`
        : "";
    const persona = stripYouSoundLike(full.headline);
    const text = persona
      ? `声音照妖镜判决 · ${persona}`
      : "声音照妖镜判决书";
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & {
          share: (d: { title?: string; text?: string; url?: string }) => Promise<void>;
        }).share({ title: "声音照妖镜", text, url });
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    await doCopyLink();
  };

  const vbti = isVbti(full) ? full : null;

  /* ─── metric extraction ─── */
  // These five labels ARE the product's flagship metric — name/mapping
  // must match the design brief exactly, even where two rows share a
  // source (节目效果值 and 抓马值 are both drama density).
  const z1 = vbti?.z1SpeedStability ?? 0;
  const dramaAvg = vbti?.dramaDensityAvg ?? 0;
  const contrastAvg = vbti?.contrastRateAvg ?? 0;
  const contrastStd = vbti?.contrastRateStd ?? 0;
  const z2 = vbti?.z2VolumeStrength ?? 0;
  const z3 = vbti?.z3MonologueTendency ?? 0;
  const statBars: { label: string; value: number }[] = [
    { label: "嘴硬指数", value: z1 },
    { label: "节目效果值", value: dramaAvg },
    { label: "抓马值", value: dramaAvg },
    { label: "破防值", value: 100 - z1 },
    { label: "情绪泄漏值", value: contrastAvg },
  ];

  const persona = stripYouSoundLike(full.headline) || full.headline || "无名嫌疑人";
  const subsystemTitle = vbti?.subsystemTitle;
  const flipPct = Math.round(contrastAvg);
  const [line1, line2] = splitJudgment(
    (full as { cardCopy?: string }).cardCopy ?? "",
    full.headline ?? "",
  );

  /* ─── exhibits ─── */
  const rawEvidence = vbti ? coerceEvidence(vbti.evidenceJson) : [];
  const exhibits: EvidenceItem[] = vbti
    ? rawEvidence.length > 0
      ? rawEvidence.slice(0, 4)
      : synthesizeExhibits(vbti.segmentsSummary ?? [])
    : [];

  return (
    <article className="flex flex-col gap-6 pb-12">
      {/* 1 · Top header row */}
      <header className="flex items-center justify-between font-mono text-[11px] tracking-[0.3em] text-copperDim uppercase">
        <span>声音照妖镜判决书</span>
        <span>CASE FILE Nº {shortId}</span>
      </header>

      {/* 2 · 嫌疑人档案 aged card */}
      <div className="animate-fade-up" style={{ animationDelay: "0ms" }}>
        <AgedCard rotate={-1.5} pin="left" className="text-inkText">
          <div className="flex flex-col gap-4">
            <CaseId n="01" label="SUSPECT" />

            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] tracking-[0.25em] text-inkText/50 uppercase mb-1">
                  嫌 疑 人 格
                </div>
                <h1 className="font-heading font-black text-inkText leading-tight text-[22px] break-words">
                  {persona}
                </h1>
                {subsystemTitle && (
                  <div className="mt-2">
                    <span className="inline-block border border-copperDim text-copperDim font-mono text-[10px] tracking-[0.15em] uppercase px-2 py-[3px] rounded-sharp bg-inkText/[0.03]">
                      分区 · {subsystemTitle}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-inkText/15" />

            <div className="flex items-end justify-between gap-4">
              <div className="flex-1">
                <div className="font-mono text-[10px] tracking-[0.25em] text-inkText/50 uppercase mb-1">
                  人 设 翻 车 率
                </div>
                <div className="font-mono text-inkText font-bold text-[38px] leading-none tabular-nums">
                  {flipPct}
                  <span className="text-inkText/50 text-[20px] ml-0.5">%</span>
                </div>
              </div>
              <div className="pt-2">
                <Stamp text="已实锤" size="md" drop rotate={-14} />
              </div>
            </div>
          </div>
        </AgedCard>
      </div>

      {/* 3 · Hero portrait */}
      {full.imageUrl && (
        <div className="animate-fade-up" style={{ animationDelay: "100ms" }}>
          <AgedCard rotate={1} className="p-3">
            <div className="relative w-full aspect-square bg-cardPaperEdge/40 rounded-sharp overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={full.imageUrl}
                alt={persona}
                className="w-full h-full object-contain"
                loading="lazy"
              />
              {/* corner exhibit tag riding on top of the portrait */}
              <div className="absolute top-2 right-2">
                <ExhibitTag label="PORTRAIT · 01" />
              </div>
            </div>
          </AgedCard>
        </div>
      )}

      {/* 4 · Judgment quote */}
      {(line1 || line2) && (
        <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
          <AgedCard rotate={-0.8} className="text-inkText">
            <div className="relative py-3">
              <span
                aria-hidden
                className="absolute -top-2 left-1 font-display text-[56px] leading-none text-rust/70 select-none"
              >
                「
              </span>
              <div className="px-6 flex flex-col gap-2">
                {line1 && (
                  <p className="font-heading font-bold text-inkText text-judgment leading-snug">
                    {line1}
                  </p>
                )}
                {line2 && (
                  <p className="font-heading font-medium text-inkText/80 text-[15px] leading-relaxed">
                    {line2}
                  </p>
                )}
              </div>
              <span
                aria-hidden
                className="absolute -bottom-6 right-1 font-display text-[56px] leading-none text-rust/70 select-none"
              >
                」
              </span>
            </div>
          </AgedCard>
        </div>
      )}

      {/* 5 · Blackboard · 声音暴露指数 */}
      {vbti && (
        <div className="animate-fade-up" style={{ animationDelay: "300ms" }}>
          <Blackboard>
            <div className="flex items-start justify-between mb-3">
              <h2 className="font-heading font-black text-copper text-h2 tracking-wider">
                声音暴露指数
              </h2>
              <ExhibitTag label="AUDIO · 05" />
            </div>
            <div className="flex flex-col divide-y divide-copperDim/15">
              {statBars.map((b, i) => (
                <div
                  key={i}
                  className="animate-fade-up"
                  style={{ animationDelay: `${350 + i * 60}ms` }}
                >
                  <StatBar label={b.label} value={b.value} outOf={100} />
                </div>
              ))}
            </div>
          </Blackboard>
        </div>
      )}

      {/* 6 · Blackboard · 系统掌握的 N 条罪证 */}
      {vbti && exhibits.length > 0 && (
        <div className="animate-fade-up" style={{ animationDelay: "400ms" }}>
          <Blackboard>
            <div className="flex items-start justify-between mb-3">
              <h2 className="font-heading font-black text-copper text-h2 tracking-wider">
                系统掌握的 {exhibits.length} 条罪证
              </h2>
              <ExhibitTag label={`CT · 0${exhibits.length}`} />
            </div>
            <div className="flex flex-col gap-3">
              {exhibits.map((ev, i) => {
                const letter = EXHIBIT_LETTERS[i] ?? String(i + 1);
                const rotate = i % 2 === 0 ? -0.8 : 0.9;
                return (
                  <div
                    key={ev.key ?? i}
                    className="animate-fade-up"
                    style={{ animationDelay: `${450 + i * 80}ms` }}
                  >
                    <AgedCard rotate={rotate} className="text-inkText">
                      <div className="flex gap-3">
                        <div className="pt-0.5">
                          <ExhibitTag label={`EXHIBIT ${letter}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[10px] tracking-[0.2em] text-inkText/55 uppercase mb-1">
                            {ev.segmentIndex ? `第 ${ev.segmentIndex} 题` : ev.label || "证物"}
                            {typeof ev.value === "number" && ev.unit
                              ? ` · ${Math.round(ev.value)}${ev.unit}`
                              : typeof ev.value === "number"
                                ? ` · ${Math.round(ev.value)}`
                                : ev.value
                                  ? ` · ${ev.value}${ev.unit ?? ""}`
                                  : ""}
                          </div>
                          <p className="text-[13px] leading-relaxed text-inkText/85 break-words">
                            {ev.text || "(无描述)"}
                          </p>
                        </div>
                      </div>
                    </AgedCard>
                  </div>
                );
              })}
            </div>
          </Blackboard>
        </div>
      )}

      {/* 7 · Optional additional metrics */}
      {vbti && (
        <div className="animate-fade-up" style={{ animationDelay: "550ms" }}>
          <Blackboard rivets={false}>
            <div className="grid grid-cols-3 gap-3 py-1">
              <MetricCell label="翻车方差" value={contrastStd} unit="σ" />
              <MetricCell label="声压强度" value={z2} unit="/100" />
              <MetricCell label="独白倾向" value={z3} unit="/100" />
            </div>
          </Blackboard>
        </div>
      )}

      {/* 8 · Share flow */}
      <div className="animate-fade-up" style={{ animationDelay: "650ms" }}>
        <Blackboard title="分享档案">
          {!share ? (
            <div className="flex flex-col gap-3">
              <p className="text-paperDim text-[13px] leading-relaxed">
                一键生成分享图,把这份判决书发去群里公开审判。
              </p>
              <CopperButton onClick={doShare} disabled={sharing}>
                {sharing ? "冲洗中……" : "生成分享图"}
              </CopperButton>
              {shareErr && (
                <p className="text-rust font-mono text-[11px]">{shareErr}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-sharp overflow-hidden border border-copperDim/40 bg-black/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={share.shareImageUrl}
                  alt="分享图"
                  className="w-full h-auto"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <CopperButton
                  as="a"
                  href={share.shareImageUrl}
                  download
                  className="text-center"
                >
                  存 图
                </CopperButton>
                <CopperButton
                  as="a"
                  href={share.shareUrl}
                  className="text-center"
                >
                  打 开
                </CopperButton>
              </div>
            </div>
          )}
        </Blackboard>
      </div>

      {/* CTA row */}
      <div
        className="flex flex-col gap-3 animate-fade-up"
        style={{ animationDelay: "750ms" }}
      >
        <RustButton onClick={doCopyLink} className="w-full text-[15px] py-4">
          {copied ? "已复制 · 链接归你了" : "公开处刑 · 复制链接"}
        </RustButton>
        <div className="grid grid-cols-2 gap-2">
          <CopperButton onClick={doSystemShare} className="text-center">
            发群里看看
          </CopperButton>
          <CopperButton as="a" href="/" className="text-center">
            拉人受审
          </CopperButton>
        </div>
        <p className="font-mono text-[10px] tracking-[0.25em] text-paperMuted uppercase text-center pt-1">
          分析基于本次 60s 声学取证 · 结果仅供娱乐
        </p>
      </div>

      <ChainDivider />
    </article>
  );
}

/* ────────── small internal cells ────────── */

function MetricCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex flex-col items-center text-center border border-copperDim/20 rounded-sharp py-2 px-1 bg-black/20">
      <div className="font-mono text-[9px] tracking-[0.2em] text-copperDim uppercase mb-1">
        {label}
      </div>
      <div className="font-mono font-bold text-copper text-[18px] leading-none tabular-nums">
        {typeof value === "number" ? value.toFixed(unit === "σ" ? 1 : 0) : value}
      </div>
      <div className="font-mono text-[9px] text-paperMuted mt-0.5">{unit}</div>
    </div>
  );
}
