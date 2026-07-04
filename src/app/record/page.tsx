"use client";

/**
 * VBTI · 声音照妖镜 · Record page.
 *
 * 5 sequential "案发现场" scenes. See SCENARIOS in ./scenarios.ts and the
 * user-provided design brief. Q5 has a stage-direction picker (male / female
 * / random blind-box) before recording.
 *
 * State machine (see PRD-VBTI-v1.1 §5A):
 *   intro → brief → recording → review → (brief|uploading)
 *   Q5:  ... → stage-choice → recording → review → uploading
 *   any: → error → (brief for current qIndex | intro reset)
 *
 * Audio pipeline notes:
 * - The MediaStream is requested ONCE on the intro→brief transition and
 *   reused for all 5 scenes to avoid re-prompting mic permission and to
 *   avoid per-scene AudioContext churn on Safari.
 * - It's released on unmount or on error/reset.
 * - MediaRecorder is created fresh per scene so each segment's `onstop`
 *   yields exactly one Blob.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AgedCard,
  Blackboard,
  ExhibitTag,
  ScanLine,
  CaseId,
  ChainDivider,
  RustButton,
  CopperButton,
} from "@/components/vbti/material";
import { SCENARIOS, TOTAL_DURATION_SECONDS, type Scenario } from "./scenarios";

type Phase =
  | "intro"
  | "stage-choice"
  | "brief"
  | "recording"
  | "review"
  | "uploading"
  | "error";

type StageDirection = "male" | "female" | "random";

const BAR_COUNT = 32;
const WAVE_W = 260;
const WAVE_H = 88;

/** Rotations for the intro stacked case cards. */
const INTRO_ROTATIONS = [-2, 1.5, -1, 2, -1.5];

/** Cycling microcopy for the uploading phase (index rotates ~every 1.4s). */
const UPLOAD_LINES = [
  "正在比对你的嘴硬程度……",
  "正在提取你第 4 题的破防波形……",
  "正在分析你有没有偷偷抢麦……",
  "正在锁定人格作案动机……",
  "正在生成判决书……",
];

/** Copy shown in the intro rules-inline expandable. */
const RULES_BODY = [
  "· 全程只做本地录音 + 声学特征提取,不上传原始波形做训练。",
  "· 需要浏览器麦克风权限。中途关闭或拒绝会中断取证。",
  "· 请找一个相对安静的地方,自然语速,可以停顿、可以笑。",
];

/** Choose an available recorder MIME type in order of preference. */
function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "";
}

function extFor(mime: string): string {
  return mime.includes("mp4") ? "m4a" : "webm";
}

export default function RecordPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("intro");
  const [qIndex, setQIndex] = useState(0);
  const [segments, setSegments] = useState<Blob[]>([]);
  const [stageDirection, setStageDirection] = useState<StageDirection | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [uploadLineIndex, setUploadLineIndex] = useState(0);

  // Audio graph refs — never in state to avoid rerender churn.
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const startAtRef = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const barRefs = useRef<Array<SVGRectElement | null>>([]);
  // Blob that just got recorded — needed for the review preview and to
  // append to `segments` when the user hits 继续.
  const pendingBlobRef = useRef<Blob | null>(null);
  const pendingMimeRef = useRef<string>("");

  const scenario = SCENARIOS[qIndex];

  /* ────────── cleanup ────────── */

  const stopRafAndTimers = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const releaseMic = useCallback(() => {
    stopRafAndTimers();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* noop */
      }
    }
    recorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, [stopRafAndTimers]);

  useEffect(() => () => releaseMic(), [releaseMic]);

  /* ────────── mic acquisition (reused across scenes) ────────── */

  const ensureMic = useCallback(async (): Promise<boolean> => {
    if (mediaStreamRef.current && analyserRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyserRef.current = analyser;
      return true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "无法访问麦克风,请检查权限设置。";
      setErrorMsg(msg);
      setPhase("error");
      releaseMic();
      return false;
    }
  }, [releaseMic]);

  /* ────────── waveform rAF loop ────────── */

  const drawWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const bins = analyser.frequencyBinCount;
    const buf = new Uint8Array(bins);
    analyser.getByteFrequencyData(buf);
    // Sample bins across the low-mid range (voice sits below ~4kHz).
    // Skip the DC-ish first bin and downweight the very top of the range.
    const usable = Math.floor(bins * 0.55);
    const step = Math.max(1, Math.floor(usable / BAR_COUNT));
    for (let i = 0; i < BAR_COUNT; i++) {
      let peak = 0;
      const start = 1 + i * step;
      const end = Math.min(usable, start + step);
      for (let j = start; j < end; j++) {
        if (buf[j] > peak) peak = buf[j];
      }
      // 0..1 with a floor so the bars never fully collapse.
      const norm = Math.max(0.06, peak / 255);
      const h = norm * WAVE_H * 0.94;
      const el = barRefs.current[i];
      if (el) {
        el.setAttribute("height", h.toFixed(1));
        el.setAttribute("y", ((WAVE_H - h) / 2).toFixed(1));
      }
    }
    rafRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  /* ────────── recording ────────── */

  const startRecording = useCallback(async () => {
    setErrorMsg("");
    const ok = await ensureMic();
    if (!ok) return;
    const stream = mediaStreamRef.current;
    if (!stream) return;

    const mime = pickMimeType();
    const rec = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    recorderRef.current = rec;
    chunksRef.current = [];
    pendingBlobRef.current = null;
    pendingMimeRef.current = rec.mimeType || mime || "audio/webm";

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || pendingMimeRef.current || "audio/webm";
      pendingMimeRef.current = type;
      pendingBlobRef.current = new Blob(chunksRef.current, { type });
      stopRafAndTimers();
      setPhase("review");
    };

    rec.start();
    startAtRef.current = Date.now();
    setElapsed(0);
    setPhase("recording");
    rafRef.current = requestAnimationFrame(drawWaveform);

    stopTimerRef.current = setTimeout(() => {
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {
        /* noop */
      }
    }, scenario.duration * 1000);

    tickTimerRef.current = setInterval(() => {
      const s = (Date.now() - startAtRef.current) / 1000;
      setElapsed(Math.min(scenario.duration, s));
    }, 100);
  }, [ensureMic, drawWaveform, stopRafAndTimers, scenario.duration]);

  const stopRecording = useCallback(() => {
    if (!recorderRef.current) return;
    if (recorderRef.current.state === "inactive") return;
    try {
      recorderRef.current.stop();
    } catch {
      /* noop */
    }
  }, []);

  /* ────────── upload ────────── */

  const uploadAll = useCallback(
    async (all: Blob[]) => {
      setPhase("uploading");
      try {
        const fd = new FormData();
        const meta: { questionCount: number; stageDirection?: StageDirection } = {
          questionCount: all.length,
        };
        if (stageDirection) meta.stageDirection = stageDirection;
        fd.append("meta", JSON.stringify(meta));
        for (let i = 0; i < all.length; i++) {
          const b = all[i];
          const ext = extFor(b.type || "");
          fd.append("audio", b, `scene-${i + 1}.${ext}`);
        }
        const res = await fetch("/api/analyze", { method: "POST", body: fd });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`取证服务异常 (${res.status}) ${txt.slice(0, 120)}`);
        }
        const data = (await res.json()) as { resultId?: string };
        if (!data.resultId) {
          throw new Error("服务器未返回 resultId");
        }
        releaseMic();
        router.push(`/result/${data.resultId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "上传失败";
        setErrorMsg(msg);
        setPhase("error");
      }
    },
    [releaseMic, router, stageDirection],
  );

  /* ────────── flow transitions ────────── */

  const beginRun = useCallback(async () => {
    setErrorMsg("");
    setSegments([]);
    setStageDirection(null);
    setQIndex(0);
    const ok = await ensureMic();
    if (ok) setPhase("brief");
  }, [ensureMic]);

  const continueFromReview = useCallback(() => {
    const blob = pendingBlobRef.current;
    if (!blob) return;
    const next = [...segments, blob];
    pendingBlobRef.current = null;
    setSegments(next);
    if (qIndex >= 4) {
      // All 5 done — upload.
      uploadAll(next);
      return;
    }
    const nextIdx = qIndex + 1;
    setQIndex(nextIdx);
    setElapsed(0);
    // Q5 needs stage direction picked first.
    if (nextIdx === 4 && !stageDirection) {
      setPhase("stage-choice");
    } else {
      setPhase("brief");
    }
  }, [qIndex, segments, stageDirection, uploadAll]);

  const redoCurrent = useCallback(() => {
    pendingBlobRef.current = null;
    setElapsed(0);
    // For Q5 we go back to stage-choice so the user can re-pick tone if they
    // want; if they've already picked, the choice sticks.
    if (qIndex === 4) {
      setPhase("stage-choice");
    } else {
      setPhase("brief");
    }
  }, [qIndex]);

  const resetAll = useCallback(() => {
    releaseMic();
    pendingBlobRef.current = null;
    setSegments([]);
    setQIndex(0);
    setStageDirection(null);
    setElapsed(0);
    setErrorMsg("");
    setPhase("intro");
  }, [releaseMic]);

  /* ────────── uploading microcopy cycle ────────── */

  useEffect(() => {
    if (phase !== "uploading") return;
    setUploadLineIndex(0);
    const id = setInterval(() => {
      setUploadLineIndex((i) => (i + 1) % UPLOAD_LINES.length);
    }, 1400);
    return () => clearInterval(id);
  }, [phase]);

  /* ────────── derived ────────── */

  const canStop =
    phase === "recording" &&
    elapsed >= Math.min(6, Math.max(1, scenario.duration - 2));
  const secondsRemaining = Math.max(0, scenario.duration - elapsed);
  const danger = phase === "recording" && secondsRemaining <= 3;
  const progress = Math.min(1, elapsed / scenario.duration);

  const doneCount = segments.length;

  const breadcrumbMetric = useMemo(() => {
    if (phase === "intro") return `TOTAL ${TOTAL_DURATION_SECONDS}s · 5 CASES`;
    return scenario.metric.toUpperCase();
  }, [phase, scenario.metric]);

  /* ────────── render ────────── */

  return (
    <main className="relative min-h-[100dvh] text-paper">
      <div className="relative z-10 mx-auto w-full max-w-[540px] px-safe-x py-6 pb-16">
        {/* Case-file breadcrumb strip. Present in all phases. */}
        <CaseBreadcrumb
          currentIndex={phase === "intro" ? -1 : qIndex}
          doneCount={doneCount}
          metric={breadcrumbMetric}
        />

        {phase === "intro" && (
          <IntroPanel
            rulesOpen={rulesOpen}
            setRulesOpen={setRulesOpen}
            onBegin={beginRun}
          />
        )}

        {phase === "brief" && (
          <BriefPanel scenario={scenario} onStart={startRecording} />
        )}

        {phase === "stage-choice" && (
          <StageChoicePanel
            scenario={scenario}
            selection={stageDirection}
            onSelect={setStageDirection}
            onStart={startRecording}
          />
        )}

        {phase === "recording" && (
          <RecordingPanel
            scenario={scenario}
            elapsed={elapsed}
            progress={progress}
            danger={danger}
            canStop={canStop}
            barRefs={barRefs}
            onStop={stopRecording}
          />
        )}

        {phase === "review" && (
          <ReviewPanel
            scenario={scenario}
            isLast={qIndex >= 4}
            onRedo={redoCurrent}
            onContinue={continueFromReview}
          />
        )}

        {phase === "uploading" && (
          <UploadingPanel lineIndex={uploadLineIndex} />
        )}

        {phase === "error" && (
          <ErrorPanel
            errorMsg={errorMsg}
            onRetryCurrent={async () => {
              setErrorMsg("");
              const ok = await ensureMic();
              if (!ok) return;
              if (qIndex === 4 && !stageDirection) {
                setPhase("stage-choice");
              } else {
                setPhase("brief");
              }
            }}
            onResetAll={resetAll}
          />
        )}

        <ChainDivider />
      </div>
    </main>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  Sub-panels                                                            */
/* ══════════════════════════════════════════════════════════════════════ */

function CaseBreadcrumb({
  currentIndex,
  doneCount,
  metric,
}: {
  currentIndex: number;
  doneCount: number;
  metric: string;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3 animate-fade-up">
      <div className="flex items-center gap-2">
        {SCENARIOS.map((s, i) => {
          const isCurrent = i === currentIndex;
          const isDone = i < doneCount;
          return (
            <div
              key={s.caseId}
              className="flex flex-col items-center"
              aria-label={`案发现场 ${s.caseId} ${
                isDone ? "已完成" : isCurrent ? "进行中" : "待处理"
              }`}
            >
              <div
                className={
                  "relative flex h-8 w-8 items-center justify-center rounded-sharp border font-mono text-[11px] tracking-[0.05em] transition-all duration-300 ease-out-strong " +
                  (isCurrent
                    ? "border-copper bg-rust text-paper shadow-[0_0_10px_rgba(196,75,47,0.45)]"
                    : isDone
                      ? "border-copper text-copper"
                      : "border-copperDim/50 text-paperMuted")
                }
              >
                <span>{s.caseId}</span>
                {isDone && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-copper text-[9px] font-bold text-ink"
                  >
                    ✓
                  </span>
                )}
              </div>
              {i < SCENARIOS.length - 1 && null}
            </div>
          );
        })}
      </div>
      <div className="text-right font-mono text-label uppercase text-copperDim">
        <div className="text-[10px] text-paperMuted">METRIC</div>
        <div className="mt-0.5 max-w-[140px] truncate text-copper" title={metric}>
          {metric}
        </div>
      </div>
    </div>
  );
}

/* ────────── intro ────────── */

function IntroPanel({
  rulesOpen,
  setRulesOpen,
  onBegin,
}: {
  rulesOpen: boolean;
  setRulesOpen: (v: boolean) => void;
  onBegin: () => void;
}) {
  return (
    <section className="flex flex-col items-center gap-6 pt-2 animate-fade-up">
      <div className="flex flex-col items-center gap-3 text-center">
        <CaseId n="00" label="卷宗" />
        <h1 className="font-display text-display text-paper leading-tight">
          声音照妖镜
        </h1>
        <p className="font-heading text-h2 text-copper">
          5 个案发现场,一份判决书
        </p>
        <p className="max-w-[380px] font-mono text-label uppercase text-paperMuted">
          SYSTEM ONLY LISTENS · NO JUDGMENT OF WORDS · 60 SEC TOTAL
        </p>
      </div>

      {/* Stacked case cards preview. */}
      <div className="relative flex w-full flex-col items-stretch gap-3 py-2">
        {SCENARIOS.map((s, i) => (
          <AgedCard
            key={s.caseId}
            rotate={INTRO_ROTATIONS[i]}
            className="animate-fade-up"
            style={{ animationDelay: `${120 + i * 80}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-paperMuted uppercase">
                  <span className="text-rust font-bold">Nº {s.caseId}</span>
                  <span className="opacity-40">·</span>
                  <span>{s.duration}s</span>
                </div>
                <div className="mt-1 font-heading text-[16px] font-bold text-inkText">
                  {s.title}
                </div>
                <div className="mt-1 line-clamp-1 text-[13px] text-inkText/80">
                  {s.question}
                </div>
              </div>
              <ExhibitTag label={`CASE · ${s.caseId}`} className="shrink-0" />
            </div>
            <div className="mt-2 font-mono text-[10px] tracking-[0.1em] text-inkText/60">
              {s.metric}
            </div>
          </AgedCard>
        ))}
      </div>

      <div className="w-full flex flex-col items-stretch gap-3">
        <div className="flex justify-center">
          <CopperButton
            onClick={() => setRulesOpen(!rulesOpen)}
            aria-expanded={rulesOpen}
          >
            {rulesOpen ? "▾ 档案室规则" : "▸ 档案室规则"}
          </CopperButton>
        </div>
        {rulesOpen && (
          <div
            className="animate-fade-up rounded-sharp border border-copperDim/40 bg-cardDark/70 p-4 font-mono text-[12px] leading-relaxed text-paperDim"
          >
            {RULES_BODY.map((line, i) => (
              <div key={i} className="mb-1 last:mb-0">
                {line}
              </div>
            ))}
          </div>
        )}
        <RustButton onClick={onBegin} className="mt-2 w-full text-[16px]">
          开始受审 →
        </RustButton>
      </div>
    </section>
  );
}

/* ────────── brief ────────── */

function BriefPanel({
  scenario,
  onStart,
}: {
  scenario: Scenario;
  onStart: () => void;
}) {
  return (
    <section className="flex flex-col gap-5 animate-fade-up">
      <Blackboard title={`案发现场 Nº ${scenario.caseId} · ${scenario.title}`}>
        <div className="flex items-center justify-between font-mono text-label uppercase text-copperDim">
          <span>{scenario.duration}s · 单条口供</span>
          <span className="text-copper">{scenario.metric}</span>
        </div>
      </Blackboard>

      <AgedCard rotate={-1} pin="right">
        <div className="mb-3">
          <CaseId n={scenario.caseId} />
        </div>
        <div className="space-y-2 text-[15px] leading-relaxed text-inkText">
          {scenario.situation.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>

        {/* Prompt block — the "witness statement" being handed over. */}
        <div className="relative mt-5">
          <div
            className="absolute -top-3 left-2"
            aria-hidden
          >
            <ExhibitTag label={`COMMS · Nº ${scenario.caseId}`} />
          </div>
          <div
            className="h-[2px] w-full"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, #C44B2F 20%, #E8B87A 80%, transparent 100%)",
            }}
            aria-hidden
          />
          <div className="mt-3 rounded-sharp border border-copperDim/50 bg-cardPaperEdge/50 px-4 py-3">
            <div className="font-mono text-[10px] tracking-[0.2em] text-inkText/50 uppercase">
              PROMPT
            </div>
            <p className="mt-1 font-heading text-[16px] font-bold text-inkText">
              「{scenario.prompt}」
            </p>
          </div>
        </div>
      </AgedCard>

      <RustButton onClick={onStart} className="w-full text-[16px]">
        开始采集声纹 · {scenario.duration}s
      </RustButton>
    </section>
  );
}

/* ────────── stage-choice (Q5) ────────── */

function StageChoicePanel({
  scenario,
  selection,
  onSelect,
  onStart,
}: {
  scenario: Scenario;
  selection: StageDirection | null;
  onSelect: (v: StageDirection) => void;
  onStart: () => void;
}) {
  const options = scenario.stageOptions ?? [];
  const actLines = scenario.actLines ?? [];
  return (
    <section className="flex flex-col gap-5 animate-fade-up">
      <Blackboard title={`案发现场 Nº ${scenario.caseId} · ${scenario.title}`}>
        <div className="flex items-center justify-between font-mono text-label uppercase text-copperDim">
          <span>{scenario.duration}s · 三幕连演</span>
          <span className="text-copper">{scenario.metric}</span>
        </div>
      </Blackboard>

      <div className="grid grid-cols-1 gap-3">
        {options.map((opt) => {
          const active = selection === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={
                "aged-paper relative w-full px-5 py-4 text-left transition-transform duration-200 ease-out-strong active:scale-[0.97] " +
                (active
                  ? "ring-2 ring-copper shadow-cardHover"
                  : "hover:-translate-y-[1px]")
              }
              style={{
                transform: active ? "rotate(-0.5deg)" : "rotate(0deg)",
              }}
              aria-pressed={active}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-heading text-[17px] font-bold text-inkText">
                    {opt.label}
                  </div>
                  <div className="mt-1 font-mono text-label uppercase text-inkText/60">
                    {opt.hint}
                  </div>
                </div>
                <div
                  className={
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 " +
                    (active
                      ? "border-rust bg-rust text-paper"
                      : "border-copperDim/60")
                  }
                  aria-hidden
                >
                  {active ? "✓" : ""}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selection && (
        <AgedCard rotate={-0.5} className="animate-fade-up">
          <div className="mb-2 flex items-center justify-between">
            <ExhibitTag label="剧本 · SCRIPT" />
            <span className="font-mono text-label uppercase text-inkText/50">
              3 幕 · 每幕换一种语气
            </span>
          </div>
          <ol className="mt-2 space-y-3">
            {actLines.map((l, i) => (
              <li key={i} className="border-l-2 border-rust/60 pl-3">
                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-inkText/60">
                  幕 {i + 1} · {l.role} · {l.tone}
                </div>
                <div className="mt-0.5 font-heading text-[15px] text-inkText">
                  「{l.text}」
                </div>
              </li>
            ))}
          </ol>
        </AgedCard>
      )}

      <RustButton
        onClick={onStart}
        disabled={!selection}
        className="w-full text-[16px]"
      >
        开始采集声纹 · {scenario.duration}s
      </RustButton>
    </section>
  );
}

/* ────────── recording ────────── */

function RecordingPanel({
  scenario,
  elapsed,
  progress,
  danger,
  canStop,
  barRefs,
  onStop,
}: {
  scenario: Scenario;
  elapsed: number;
  progress: number;
  danger: boolean;
  canStop: boolean;
  barRefs: React.MutableRefObject<Array<SVGRectElement | null>>;
  onStop: () => void;
}) {
  const remain = Math.max(0, scenario.duration - elapsed);
  const elapsedInt = Math.min(scenario.duration, Math.floor(elapsed));
  return (
    <section className="flex flex-col gap-5 animate-fade-up">
      <div className="relative overflow-hidden">
        <Blackboard>
          <ScanLine visible />
          <div className="relative z-20">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-label uppercase text-copperDim">
                  REC · 案发现场 Nº {scenario.caseId}
                </div>
                <p className="mt-1 text-[13px] text-paperDim line-clamp-2">
                  「{scenario.prompt}」
                </p>
              </div>
              <ExhibitTag label={`REC · Nº ${scenario.caseId}`} />
            </div>

            <div className="mt-2 grid grid-cols-[auto_1fr] gap-4 items-center">
              {/* Big circular record button + progress ring. */}
              <div className="relative h-32 w-32">
                <RecordRing progress={progress} danger={danger} />
                <button
                  type="button"
                  onClick={onStop}
                  disabled={!canStop}
                  aria-label={canStop ? "停止取证" : "至少再录几秒"}
                  className={
                    "absolute inset-3 flex items-center justify-center rounded-full font-heading text-[13px] font-bold transition-transform duration-150 ease-out-strong active:scale-[0.97] " +
                    (canStop
                      ? "bg-rust text-paper shadow-[0_0_20px_rgba(196,75,47,0.55)] cursor-pointer"
                      : "bg-cardDarker text-paperMuted cursor-not-allowed")
                  }
                  style={{
                    animation: canStop
                      ? "vbtiRecPulse 1.4s ease-in-out infinite"
                      : undefined,
                  }}
                >
                  {canStop ? "停止" : `${Math.max(0, Math.ceil(Math.min(6, scenario.duration - 2) - elapsed))}s`}
                </button>
              </div>

              {/* Waveform. */}
              <div>
                <svg
                  viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
                  width="100%"
                  height={WAVE_H}
                  preserveAspectRatio="none"
                  aria-hidden
                  className="block"
                >
                  <defs>
                    <linearGradient id="vbtiBarG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E8B87A" />
                      <stop offset="30%" stopColor="#D4654A" />
                      <stop offset="100%" stopColor="#C44B2F" />
                    </linearGradient>
                  </defs>
                  {Array.from({ length: BAR_COUNT }).map((_, i) => {
                    const gap = 2;
                    const bw =
                      (WAVE_W - (BAR_COUNT - 1) * gap) / BAR_COUNT;
                    const x = i * (bw + gap);
                    return (
                      <rect
                        key={i}
                        ref={(el) => {
                          barRefs.current[i] = el;
                        }}
                        x={x}
                        y={WAVE_H / 2 - 2}
                        width={bw}
                        height={4}
                        rx={1}
                        fill="url(#vbtiBarG)"
                      />
                    );
                  })}
                </svg>
                <div className="mt-3 flex items-baseline justify-between">
                  <div
                    className={
                      "font-mono text-data tabular-nums font-bold transition-colors " +
                      (danger ? "text-rust" : "text-paper")
                    }
                  >
                    {String(elapsedInt).padStart(2, "0")}
                    <span className="text-paperMuted"> / {String(scenario.duration).padStart(2, "0")}</span>
                  </div>
                  <div className="font-mono text-label uppercase text-copperDim">
                    {remain <= 3 ? "COMMS OUT SOON" : "LIVE · AUDIO IN"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Blackboard>
      </div>

      <div className="text-center font-mono text-label uppercase text-paperMuted">
        自然语速就好 · 可以停顿 · 可以笑 · 系统只听声音
      </div>

      <style>{`
        @keyframes vbtiRecPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(196,75,47,0.55), 0 0 20px rgba(196,75,47,0.55);
          }
          50% {
            box-shadow: 0 0 0 10px rgba(196,75,47,0), 0 0 24px rgba(196,75,47,0.75);
          }
        }
      `}</style>
    </section>
  );
}

function RecordRing({
  progress,
  danger,
}: {
  progress: number;
  danger: boolean;
}) {
  const R = 58;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - progress);
  return (
    <svg
      viewBox="0 0 128 128"
      className="absolute inset-0 h-full w-full -rotate-90"
      aria-hidden
    >
      <circle
        cx="64"
        cy="64"
        r={R}
        fill="none"
        stroke="rgba(232,184,122,0.14)"
        strokeWidth="4"
      />
      <circle
        cx="64"
        cy="64"
        r={R}
        fill="none"
        stroke={danger ? "#E74C3C" : "#C44B2F"}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 100ms linear" }}
      />
    </svg>
  );
}

/* ────────── review ────────── */

function ReviewPanel({
  scenario,
  isLast,
  onRedo,
  onContinue,
}: {
  scenario: Scenario;
  isLast: boolean;
  onRedo: () => void;
  onContinue: () => void;
}) {
  // Decorative frozen waveform — 32 pseudo-random bars, deterministic per
  // scenario so re-entering review doesn't reshuffle.
  const frozenHeights = useMemo(() => {
    const seed = parseInt(scenario.caseId, 10) || 1;
    const arr: number[] = [];
    let s = seed * 9301 + 49297;
    for (let i = 0; i < BAR_COUNT; i++) {
      s = (s * 9301 + 49297) % 233280;
      const r = s / 233280;
      // envelope: rise-peak-fall
      const t = i / (BAR_COUNT - 1);
      const env = Math.sin(t * Math.PI);
      arr.push(0.15 + env * 0.7 * (0.5 + r * 0.5));
    }
    return arr;
  }, [scenario.caseId]);

  return (
    <section className="flex flex-col gap-5 animate-fade-up">
      <AgedCard rotate={-1} pin="left">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-label uppercase text-inkText/60">
              证据已锁定
            </div>
            <div className="mt-1 font-heading text-h2 font-bold text-inkText">
              案发现场 Nº {scenario.caseId} · {scenario.title}
            </div>
          </div>
          <ExhibitTag label={`EVIDENCE · ${scenario.caseId}`} />
        </div>

        <div className="mt-4 rounded-sharp border border-copperDim/40 bg-cardPaperEdge/40 p-3">
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-inkText/50 mb-2">
            SEALED WAVEFORM · {scenario.duration}s
          </div>
          <svg
            viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
            width="100%"
            height={WAVE_H * 0.75}
            preserveAspectRatio="none"
            aria-hidden
            className="block"
          >
            <defs>
              <linearGradient id="vbtiFrozenG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#B8905A" />
                <stop offset="60%" stopColor="#C44B2F" />
                <stop offset="100%" stopColor="#8B3A25" />
              </linearGradient>
            </defs>
            {frozenHeights.map((n, i) => {
              const gap = 2;
              const bw = (WAVE_W - (BAR_COUNT - 1) * gap) / BAR_COUNT;
              const x = i * (bw + gap);
              const h = n * WAVE_H * 0.94;
              return (
                <rect
                  key={i}
                  x={x}
                  y={(WAVE_H - h) / 2}
                  width={bw}
                  height={h}
                  rx={1}
                  fill="url(#vbtiFrozenG)"
                />
              );
            })}
          </svg>
        </div>

        <p className="mt-3 font-mono text-label uppercase text-inkText/50">
          可以重录一次,也可以直接归档进入{isLast ? "判决书" : "下一现场"}。
        </p>
      </AgedCard>

      <div className="grid grid-cols-[auto_1fr] gap-3">
        <CopperButton onClick={onRedo}>重录</CopperButton>
        <RustButton onClick={onContinue} className="w-full">
          {isLast ? "提交口供 · 生成判决书 →" : "继续 → 下一现场"}
        </RustButton>
      </div>
    </section>
  );
}

/* ────────── uploading ────────── */

function UploadingPanel({ lineIndex }: { lineIndex: number }) {
  return (
    <section className="flex flex-col gap-5 animate-fade-up">
      <div className="relative overflow-hidden">
        <Blackboard title="取证中 · IN EVIDENCE LAB">
          <ScanLine visible />
          <div className="relative z-20 flex flex-col items-center gap-5 py-8">
            {/* Copper "spinner" — three rotating chevrons. */}
            <div className="relative h-24 w-24">
              <div
                className="absolute inset-0 rounded-full border-2 border-copper/30"
                aria-hidden
              />
              <div
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-copper"
                style={{ animation: "vbtiSpin 1.2s linear infinite" }}
                aria-hidden
              />
              <div
                className="absolute inset-3 rounded-full border-2 border-transparent border-t-rust"
                style={{ animation: "vbtiSpin 1.8s linear reverse infinite" }}
                aria-hidden
              />
              <div className="absolute inset-0 flex items-center justify-center font-mono text-label uppercase text-copper">
                LAB
              </div>
            </div>

            <div className="w-full text-center">
              <div className="font-heading text-h2 text-paper">正在生成判决书</div>
              <div
                key={lineIndex}
                className="mt-3 min-h-[1.5em] font-mono text-label uppercase tracking-[0.15em] text-copperDim animate-fade-up"
              >
                {UPLOAD_LINES[lineIndex]}
              </div>
            </div>

            <div className="flex gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-paperMuted">
              {UPLOAD_LINES.map((_, i) => (
                <span
                  key={i}
                  className={
                    "h-1.5 w-6 rounded-full transition-colors duration-300 " +
                    (i === lineIndex ? "bg-rust" : "bg-cardDarker")
                  }
                />
              ))}
            </div>
          </div>
        </Blackboard>
      </div>
      <style>{`
        @keyframes vbtiSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}

/* ────────── error ────────── */

function ErrorPanel({
  errorMsg,
  onRetryCurrent,
  onResetAll,
}: {
  errorMsg: string;
  onRetryCurrent: () => void;
  onResetAll: () => void;
}) {
  return (
    <section className="flex flex-col gap-5 animate-fade-up">
      <div
        className="aged-paper relative px-5 py-5"
        style={{
          boxShadow:
            "0 0 0 2px rgba(231,76,60,0.55), 2px 3px 8px rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-label uppercase text-stamp">
              CASE ABORTED
            </div>
            <div className="mt-1 font-heading text-h2 font-bold text-inkText">
              取证失败
            </div>
          </div>
          <ExhibitTag label="ERROR" className="border-stamp text-stamp" />
        </div>
        <div className="mt-3 rounded-sharp border border-stamp/40 bg-cardPaperEdge/50 p-3 font-mono text-[12px] leading-relaxed text-inkText/80">
          {errorMsg || "未知错误。请检查麦克风权限或网络后重试。"}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <RustButton onClick={onRetryCurrent} className="w-full">
          重录本题
        </RustButton>
        <CopperButton onClick={onResetAll}>重来</CopperButton>
      </div>
    </section>
  );
}
