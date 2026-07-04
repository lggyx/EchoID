"use client";

import { useEffect, useMemo, useState } from "react";
import FullCard from "@/components/FullCard";
import {
  AgedCard,
  Blackboard,
  CaseId,
  RustButton,
  ScanLine,
} from "@/components/vbti/material";
import type {
  AnalyzePartialResponse,
  AnalyzeSegmentedFullResponse,
  AnalyzeSegmentedPartialResponse,
  AnalyzeFullResponse,
} from "@/types/core";
import type { ResultPartial } from "./page";

type Stage = "listening" | "reveal" | "unlocked";

// Full response can be either VBTI-segmented or legacy — <FullCard /> knows
// how to branch on `matchedSubsystem`.
type AnyFull =
  | (AnalyzeSegmentedFullResponse & { roleTitle?: string })
  | AnalyzeFullResponse;

/** VBTI headlines look like "你演得像·<小丑喜剧>". Trim the prefix so the
 *  reveal stage can lean on subsystemTitle instead of leaking the persona
 *  name too early. */
function stripYouSoundLike(s?: string): string {
  if (!s) return "";
  return s
    .replace(/^你演得像[·:：\s]*/u, "")
    .replace(/^YOU SOUND LIKE[·:：\s]*/iu, "")
    .trim();
}

// Copy that cycles across the listening screen — chalk-scribbled snippets
// the "investigator" is jotting down. Order matters; each line surfaces for
// ~600ms and the sequence starts over.
const LISTENING_LINES = [
  "正在锁定人格作案动机……",
  "比对声纹与嫌疑档案……",
  "调取节目效果、抓马值、破防瞬间……",
  "笔录已归档 · 判决书起草中……",
];

const isVbtiPartial = (
  p: ResultPartial,
): p is AnalyzeSegmentedPartialResponse => "matchedSubsystem" in p && !!p.matchedSubsystem;

export default function ResultReveal({
  resultId,
  partial,
}: {
  resultId: string;
  partial: ResultPartial;
}) {
  const isVbti = isVbtiPartial(partial);

  // Legacy payloads skip the whole取证/reveal sequence — go straight to the
  // FullCard fallback the way the old flow did.
  const [stage, setStage] = useState<Stage>(isVbti ? "listening" : "unlocked");
  const [full, setFull] = useState<AnyFull | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [fullErr, setFullErr] = useState<string>("");
  const [lineIdx, setLineIdx] = useState(0);

  const shortId = useMemo(
    () => (resultId || "").slice(0, 6).toUpperCase() || "??????",
    [resultId],
  );

  // Cycle the chalk lines while the "listening" scene is playing.
  useEffect(() => {
    if (stage !== "listening") return;
    const iv = setInterval(() => setLineIdx((i) => (i + 1) % LISTENING_LINES.length), 600);
    return () => clearInterval(iv);
  }, [stage]);

  // Auto-advance to "reveal" after 2400ms of ambient noir vibes.
  useEffect(() => {
    if (!isVbti || stage !== "listening") return;
    const t = setTimeout(() => setStage("reveal"), 2400);
    return () => clearTimeout(t);
  }, [isVbti, stage]);

  // Legacy fetch — kick off the full payload immediately, since we're
  // rendering FullCard right away.
  useEffect(() => {
    if (isVbti) return;
    let cancelled = false;
    (async () => {
      setLoadingFull(true);
      setFullErr("");
      try {
        const res = await fetch(
          `/api/analyze?resultId=${encodeURIComponent(resultId)}&full=1`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`加载完整结果失败 (${res.status})`);
        const data = (await res.json()) as AnyFull;
        if (!cancelled) setFull(data);
      } catch (err) {
        if (!cancelled) setFullErr(err instanceof Error ? err.message : "加载失败");
      } finally {
        if (!cancelled) setLoadingFull(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVbti, resultId]);

  const handleUnlock = async () => {
    setStage("unlocked");
    if (full) return;
    setLoadingFull(true);
    setFullErr("");
    try {
      const res = await fetch(
        `/api/analyze?resultId=${encodeURIComponent(resultId)}&full=1`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`加载完整判决书失败 (${res.status})`);
      const data = (await res.json()) as AnyFull;
      setFull(data);
    } catch (err) {
      setFullErr(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoadingFull(false);
    }
  };

  /* ─────────── unlocked (both branches converge) ─────────── */
  if (stage === "unlocked") {
    return (
      <main className="relative min-h-screen text-paper overflow-hidden">
        <div className="relative z-10 w-full max-w-[520px] mx-auto px-safe-x py-6">
          {loadingFull && (
            <div className="text-center text-copperDim font-mono text-[11px] tracking-[0.3em] py-16 uppercase">
              · 判决书装订中 ·
            </div>
          )}
          {fullErr && !full && (
            <div className="text-center text-rust font-mono text-sm py-16">
              {fullErr}
            </div>
          )}
          {full && <FullCard full={full} resultId={resultId} />}
        </div>
      </main>
    );
  }

  /* ─────────── stage: listening (VBTI only) ─────────── */
  if (stage === "listening") {
    return (
      <main className="relative min-h-screen text-paper overflow-hidden flex flex-col items-center justify-center px-6 py-16">
        <div className="relative z-10 w-full max-w-[460px] flex flex-col items-center gap-6">
          <div className="flex items-center justify-between w-full font-mono text-[10px] tracking-[0.35em] text-copperDim uppercase">
            <span>· FORENSICS ·</span>
            <span>Nº {shortId}</span>
          </div>
          <Blackboard className="w-full min-h-[280px] overflow-hidden" title="正在取证">
            <ScanLine />
            <div className="relative flex flex-col items-center justify-center gap-6 py-8">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-copper uppercase">
                <span
                  className="w-2 h-2 rounded-full bg-rust animate-pulse"
                  aria-hidden
                />
                <span>SYSTEM · SCANNING</span>
              </div>
              <h1 className="font-heading font-black text-copper text-h2 tracking-wider">
                系统取证中
              </h1>
              {/* three spinning bars = fake spectrogram */}
              <div className="flex items-end justify-center gap-1 h-10" aria-hidden>
                <span className="w-1.5 bg-copper/70 h-full animate-waveform-1 origin-bottom" />
                <span className="w-1.5 bg-copper/70 h-full animate-waveform-2 origin-bottom" />
                <span className="w-1.5 bg-copper/70 h-full animate-waveform-3 origin-bottom" />
                <span className="w-1.5 bg-copper/70 h-full animate-waveform-1 origin-bottom" />
                <span className="w-1.5 bg-copper/70 h-full animate-waveform-2 origin-bottom" />
              </div>
              <div className="text-paper/85 font-mono text-[12px] tracking-wider min-h-[1.5em] text-center">
                {LISTENING_LINES[lineIdx]}
              </div>
            </div>
          </Blackboard>
          <p className="font-mono text-[10px] tracking-[0.25em] text-paperMuted uppercase text-center">
            系统只听声音 · 不问对错
          </p>
        </div>
      </main>
    );
  }

  /* ─────────── stage: reveal (VBTI only) ─────────── */
  const seg = partial as AnalyzeSegmentedPartialResponse;
  const subsystemTitle = seg.subsystemTitle ?? seg.matchedSubsystem ?? "?";
  const personaHint = stripYouSoundLike(seg.headline);

  return (
    <main className="relative min-h-screen text-paper overflow-hidden flex flex-col items-center justify-center px-6 py-12">
      <div className="relative z-10 w-full max-w-[460px] flex flex-col items-center gap-8">
        <CaseId n={shortId} label="INITIAL VERDICT" />

        <AgedCard rotate={-1.5} pin="right" className="w-full text-inkText animate-fade-up">
          <div className="flex flex-col gap-4 py-4 items-center text-center">
            <div className="font-mono text-[10px] tracking-[0.35em] text-inkText/50 uppercase">
              初 步 · 系 统 判 定
            </div>
            <div className="text-inkText/60 font-mono text-[11px] tracking-[0.3em] uppercase">
              你演得像
            </div>
            <h1 className="font-display text-[52px] leading-[1] tracking-wide text-inkText">
              {subsystemTitle}
            </h1>
            {personaHint && personaHint !== subsystemTitle && (
              <div className="font-heading font-medium text-inkText/75 text-base tracking-wide max-w-[280px]">
                {/* This teases without leaking the persona name — we blur
                    every other char so unlocking still feels rewarding. */}
                <span className="inline-block px-3 py-1 border border-inkText/25 rounded-sharp bg-inkText/[0.03] text-[13px] font-mono tracking-widest">
                  PERSONA · ████████
                </span>
              </div>
            )}
            <div className="w-16 h-px bg-inkText/25 mt-1" aria-hidden />
            <p className="text-[13px] leading-relaxed text-inkText/75 max-w-[300px]">
              系统已经听完你 60 秒的声音。<br />
              人设、翻车率、抓马值 —— 全部装订成册。
            </p>
          </div>
        </AgedCard>

        <div
          className="w-full flex flex-col items-center gap-3 animate-fade-up"
          style={{ animationDelay: "300ms" }}
        >
          <RustButton
            onClick={handleUnlock}
            className="w-full text-[15px] py-4"
          >
            公开处刑 · 解锁完整判决书 →
          </RustButton>
          <p className="font-mono text-[10px] tracking-[0.25em] text-paperMuted uppercase text-center">
            五项声音暴露指数 · 系统罪证 · 分享凭证
          </p>
        </div>
      </div>
    </main>
  );
}
