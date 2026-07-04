/**
 * VBTI · 声音照妖镜 landing / hero page.
 *
 * Layout language: dark detective / archive-noir. Rotated aged-paper cards
 * scattered over the ambient spotlight+grain applied by RootLayout. DO NOT
 * re-add .spotlight / .grain here — only page-scoped content.
 *
 * DESIGN_VARIANCE=9 · MOTION_INTENSITY=7 · VISUAL_DENSITY=6.
 */
import Link from "next/link";
import {
  AgedCard,
  CaseId,
  ChainDivider,
  ExhibitTag,
  RustButton,
} from "@/components/vbti/material";
import { SCENARIOS, TOTAL_DURATION_SECONDS } from "@/app/record/scenarios";

/** Deliberate irregular rotations for the case-file preview grid — this is
 * the DESIGN_VARIANCE=9 lever, not a neat rectangular grid. */
const CARD_ROTATIONS = [-1.5, 0.8, -0.5, 1.2, -0.9];

export default function Home() {
  return (
    <main className="relative min-h-screen text-paper overflow-x-hidden">
      <div className="relative z-10 mx-auto w-full max-w-[440px] px-safe-x pb-10 pt-6 flex flex-col">
        {/* ── Header row ── */}
        <header className="flex items-center justify-between mb-8">
          <div className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="w-1.5 h-1.5 rounded-full bg-copper animate-lamp-pulse"
              style={{ boxShadow: "0 0 6px rgba(232,184,122,0.65)" }}
            />
            <ExhibitTag label="VBTI · 声音照妖镜档案室" />
          </div>
          <span className="font-mono text-[10px] tracking-[0.28em] text-copperDim uppercase">
            Case File Nº 01
          </span>
        </header>

        {/* ── Hero block ── */}
        <section
          className="flex flex-col gap-5 animate-fade-up mb-8"
          style={{ transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
        >
          <h1 className="flex flex-col gap-2">
            <span className="font-heading font-black uppercase text-h2 tracking-[0.28em] text-copper/90">
              声音照妖镜
            </span>
            <span className="font-display text-display leading-[1.05] text-paper">
              60 秒声学取证
            </span>
          </h1>

          <p className="text-body text-paperDim leading-relaxed">
            <span className="block">系统只听声音,不问对错</span>
            <span className="block text-paperMuted">
              5 个案发现场 · 一份判决书
            </span>
          </p>

          <div className="flex items-center gap-3 pt-2">
            <RustButton
              as="a"
              href="/record"
              className="text-[16px] px-6 py-3.5 tracking-[0.15em]"
            >
              开始录口供 →
            </RustButton>
            <span className="font-mono text-[10px] tracking-[0.25em] text-paperMuted uppercase">
              {TOTAL_DURATION_SECONDS}s · 5Q
            </span>
          </div>
        </section>

        <ChainDivider />

        {/* ── 5 案发现场 preview grid ── */}
        <section className="flex flex-col gap-4 pt-2">
          <div className="flex items-center justify-between px-1">
            <span className="font-heading font-black text-h2 tracking-[0.05em] text-paper">
              5 个案发现场
            </span>
            <ExhibitTag label="Exhibits A–E" />
          </div>

          <div className="flex flex-col gap-4 pt-2">
            {SCENARIOS.map((scene, i) => (
              <AgedCard
                key={scene.caseId}
                rotate={CARD_ROTATIONS[i] ?? 0}
                pin={i % 2 === 0 ? "left" : "right"}
                className="w-full"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <CaseId n={scene.caseId} />
                    <span className="font-mono text-[10px] tracking-[0.2em] text-inkText/60 uppercase">
                      • {scene.duration}s
                    </span>
                  </div>
                  <div className="font-heading font-black text-[20px] leading-tight text-inkText">
                    {scene.title}
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-inkText/65 leading-relaxed">
                    {scene.metric}
                  </div>
                </div>
              </AgedCard>
            ))}
          </div>
        </section>

        {/* ── Disclaimer ── */}
        <div className="pt-8 pb-2 flex justify-center">
          <span className="inline-block border border-copperDim/60 text-copperDim font-mono text-[10px] tracking-[0.15em] uppercase px-3 py-2 leading-relaxed text-center max-w-[380px]">
            麦克风授权后 60 秒语音将用完即删
            <br />
            无内容保留 · 无账号强制
          </span>
        </div>

        <ChainDivider />

        <footer className="pt-2 text-center">
          <span className="font-mono text-[10px] tracking-[0.3em] text-paperMuted uppercase">
            VBTI · v0.1
          </span>
        </footer>
      </div>

      {/* Fallback link that reads even without JS / images — hidden visually
          but keeps the primary CTA reachable from any state. */}
      <Link href="/record" className="sr-only">
        开始录音
      </Link>
    </main>
  );
}
