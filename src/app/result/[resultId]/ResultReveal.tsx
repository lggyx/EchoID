"use client";

import { useEffect, useState } from "react";
import FullCard from "@/components/FullCard";
import GradientBg from "@/components/GradientBg";
import GradientText from "@/components/GradientText";
import ShinyText from "@/components/ShinyText";
import type {
  AnalyzeFullResponse,
  AnalyzePartialResponse,
} from "@/types/core";

type Stage = "listening" | "reveal" | "unlocked";

export default function ResultReveal({
  resultId,
  partial,
}: {
  resultId: string;
  partial: AnalyzePartialResponse;
}) {
  const [stage, setStage] = useState<Stage>("listening");
  const [full, setFull] = useState<AnalyzeFullResponse | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [fullErr, setFullErr] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => setStage("reveal"), 3000);
    return () => clearTimeout(t);
  }, []);

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
      if (!res.ok) throw new Error(`加载完整结果失败 (${res.status})`);
      const data = (await res.json()) as AnalyzeFullResponse;
      setFull(data);
    } catch (err) {
      setFullErr(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoadingFull(false);
    }
  };

  if (stage === "unlocked") {
    return (
      <main className="relative min-h-screen bg-canvas text-ink overflow-hidden">
        <GradientBg intensity="soft" />
        <div className="relative z-10 w-full max-w-[480px] mx-auto px-6 py-8">
          {loadingFull && (
            <div className="text-center text-sm text-muted font-mono py-16">
              <ShinyText>正在展开完整卡片…</ShinyText>
            </div>
          )}
          {fullErr && !full && (
            <div className="text-center text-sm text-rose-400 py-16">
              {fullErr}
            </div>
          )}
          {full && <FullCard full={full} resultId={resultId} />}
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-canvas text-ink overflow-hidden flex flex-col items-center justify-center px-6 py-16">
      <GradientBg intensity="high" />
      <div className="relative z-10 w-full max-w-[480px] flex flex-col items-center text-center gap-8">
        <div className="font-mono text-[11px] tracking-[0.35em] text-muted">
          ECHOID
        </div>

        {stage === "listening" ? (
          <div className="flex flex-col items-center gap-6 mt-4">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-grad-primary opacity-40 blur-2xl animate-pulse-glow" />
              <span className="relative w-4 h-4 rounded-full bg-grad-primary animate-breathe" />
            </div>
            <div className="text-sm font-mono tracking-wider text-muted">
              <ShinyText>正在听你说话 · 绘制画像</ShinyText>
            </div>
            <div className="h-8" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 animate-fade-up">
            <div className="font-mono text-[10px] tracking-[0.3em] text-subtle">
              YOU SOUND LIKE
            </div>
            <h1 className="font-display font-medium text-5xl leading-tight">
              <GradientText as="span">{partial.roleTitle}</GradientText>
            </h1>
            <p className="text-base text-muted leading-relaxed max-w-[320px]">
              {partial.headline}
            </p>
          </div>
        )}

        {stage === "reveal" && (
          <div className="w-full flex flex-col items-center gap-3 mt-6 animate-fade-up">
            <button
              onClick={handleUnlock}
              className="group w-full rounded-full bg-grad-primary bg-[length:200%_200%] animate-gradient-shift text-canvas py-4 text-base font-semibold shadow-glow active:scale-[0.98] transition inline-flex items-center justify-center gap-2"
            >
              <span>分享 / 保存 · 解锁完整卡片</span>
              <span
                aria-hidden
                className="group-hover:translate-x-1 transition-transform"
              >
                →
              </span>
            </button>
            <p className="text-[11px] font-mono tracking-wider text-subtle">
              六维雷达 · 每一维的解读 · 声学证据
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
