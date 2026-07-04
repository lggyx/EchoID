"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TOPICS } from "./topics";
import DebugOverlay, { type DebugSection } from "@/components/DebugOverlay";
import { useDebugMode } from "@/lib/debug";
import GradientBg from "@/components/GradientBg";
import GradientText from "@/components/GradientText";
import ShinyText from "@/components/ShinyText";

type Phase = "idle" | "ready" | "recording" | "uploading" | "error";

const MAX_SECONDS = 30;
const MIN_SECONDS = 10;
const CANVAS_W = 300;
const CANVAS_H = 80;
const BAR_COUNT = 32;

/** Real-time signal stats sampled by the analyser loop. */
interface LiveStats {
  rms: number;         // 0..1, from time-domain frame
  peak: number;        // 0..1, absolute max in current frame
  rmsPeakEver: number; // running peak of rms
  centroid: number;    // Hz, spectral centroid — a light proxy for brightness/emotional expressiveness
  frames: number;      // frames processed since recording start
  fps: number;         // approximate render fps
}

export default function RecordPage() {
  const router = useRouter();
  const debug = useDebugMode();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [topic, setTopic] = useState<string>("");
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);

  // Refs for audio graph & recording — kept out of state to avoid rerender churn.
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startAtRef = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualStopRef = useRef<boolean>(false);

  // Debug-only running stats — updated on the same RAF loop as the waveform,
  // but committed to react state at a throttled cadence.
  const statsAccumRef = useRef({
    rms: 0,
    peak: 0,
    rmsPeakEver: 0,
    centroid: 0,
    frames: 0,
    lastCommit: 0,
    fpsFrames: 0,
    fpsSince: 0,
  });

  useEffect(() => {
    // Pick a random topic on mount only.
    setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]);
  }, []);

  const cleanupAudio = useCallback(() => {
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
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(() => () => cleanupAudio(), [cleanupAudio]);

  const drawWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);

    // --- render bars ---
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#F5F1FF";

    const step = Math.floor(buf.length / BAR_COUNT);
    const barW = (CANVAS_W - (BAR_COUNT - 1) * 2) / BAR_COUNT;
    for (let i = 0; i < BAR_COUNT; i++) {
      // amplitude in 0..1 centered on 128
      let peak = 0;
      for (let j = 0; j < step; j++) {
        const v = Math.abs(buf[i * step + j] - 128) / 128;
        if (v > peak) peak = v;
      }
      const h = Math.max(2, peak * CANVAS_H * 1.6);
      const y = (CANVAS_H - h) / 2;
      ctx.fillRect(i * (barW + 2), y, barW, h);
    }

    // --- collect stats for debug overlay ---
    // RMS + peak from the time-domain frame; spectral centroid from FFT bins.
    // Kept cheap: only compute the FFT read if debug is on OR every frame is
    // fine either way (analyser byte data is a fast copy).
    const acc = statsAccumRef.current;
    let sumSq = 0;
    let peakAbs = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      const a = v < 0 ? -v : v;
      sumSq += v * v;
      if (a > peakAbs) peakAbs = a;
    }
    const rms = Math.sqrt(sumSq / buf.length);
    acc.rms = rms;
    acc.peak = peakAbs;
    if (rms > acc.rmsPeakEver) acc.rmsPeakEver = rms;

    // Spectral centroid over FFT magnitude bins.
    const freqBins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqBins);
    let mag = 0;
    let wSum = 0;
    const sr = analyserRef.current?.context.sampleRate ?? 48000;
    const nyquist = sr / 2;
    for (let i = 0; i < freqBins.length; i++) {
      const m = freqBins[i];
      const f = (i / freqBins.length) * nyquist;
      mag += m;
      wSum += m * f;
    }
    acc.centroid = mag > 0 ? wSum / mag : 0;
    acc.frames += 1;
    acc.fpsFrames += 1;

    // Commit to state at ~10 Hz to avoid renders on every RAF.
    const now = performance.now();
    if (acc.fpsSince === 0) acc.fpsSince = now;
    if (now - acc.lastCommit > 100) {
      const dt = now - acc.fpsSince;
      const fps = dt > 0 ? (acc.fpsFrames * 1000) / dt : 0;
      acc.lastCommit = now;
      if (dt > 500) {
        acc.fpsFrames = 0;
        acc.fpsSince = now;
      }
      setLiveStats({
        rms: acc.rms,
        peak: acc.peak,
        rmsPeakEver: acc.rmsPeakEver,
        centroid: acc.centroid,
        frames: acc.frames,
        fps,
      });
    }

    rafRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const doStop = useCallback(() => {
    if (!recorderRef.current) return;
    if (recorderRef.current.state === "inactive") return;
    manualStopRef.current = true;
    try {
      recorderRef.current.stop();
    } catch {
      /* noop */
    }
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      // Set up analyser for waveform.
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AC();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024; // gives 64+ bins
      source.connect(analyser);
      analyserRef.current = analyser;

      // Pick a supported webm/opus mimeType (Safari may lack support).
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
      ];
      let picked = "";
      for (const t of candidates) {
        if (
          typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported &&
          MediaRecorder.isTypeSupported(t)
        ) {
          picked = t;
          break;
        }
      }
      const rec = picked
        ? new MediaRecorder(stream, { mimeType: picked })
        : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        cleanupAudio();
        await uploadBlob(blob, type);
      };

      rec.start();
      startAtRef.current = Date.now();
      setElapsed(0);
      // Reset live stats accumulator for this recording session.
      statsAccumRef.current = {
        rms: 0,
        peak: 0,
        rmsPeakEver: 0,
        centroid: 0,
        frames: 0,
        lastCommit: 0,
        fpsFrames: 0,
        fpsSince: 0,
      };
      setPhase("recording");
      rafRef.current = requestAnimationFrame(drawWaveform);

      // Hard cap at MAX_SECONDS.
      stopTimerRef.current = setTimeout(() => {
        doStop();
      }, MAX_SECONDS * 1000);

      // Elapsed tick.
      tickTimerRef.current = setInterval(() => {
        const s = (Date.now() - startAtRef.current) / 1000;
        setElapsed(s);
      }, 100);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "无法访问麦克风,请检查权限设置。";
      setErrorMsg(msg);
      setPhase("error");
      cleanupAudio();
    }
  }, [cleanupAudio, doStop, drawWaveform]);

  const uploadBlob = useCallback(
    async (blob: Blob, type: string) => {
      setPhase("uploading");
      try {
        const ext = type.includes("mp4") ? "m4a" : "webm";
        const fd = new FormData();
        fd.append("audio", blob, `recording.${ext}`);
        const res = await fetch("/api/analyze", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`分析请求失败 (${res.status}) ${txt.slice(0, 120)}`);
        }
        const data = (await res.json()) as { resultId?: string };
        if (!data.resultId) {
          throw new Error("服务器未返回 resultId");
        }
        router.push(`/result/${data.resultId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "上传失败";
        setErrorMsg(msg);
        setPhase("error");
      }
    },
    [router],
  );

  const canStop = elapsed >= MIN_SECONDS;
  const secondsRemaining = Math.max(0, MAX_SECONDS - elapsed);
  const belowTen = phase === "recording" && secondsRemaining <= 10;
  const progress = Math.min(1, elapsed / MAX_SECONDS);

  const debugSections: DebugSection[] = debug
    ? [
        {
          title: "phase",
          rows: [
            ["phase", phase],
            ["elapsed", `${elapsed.toFixed(2)}s`],
            ["canStop", canStop ? "yes" : "no"],
            ["mimeType", recorderRef.current?.mimeType ?? "-"],
          ],
        },
        {
          title: "live signal (analyser)",
          rows: liveStats
            ? [
                ["rms", liveStats.rms],
                ["rms peak", liveStats.rmsPeakEver],
                ["peak abs", liveStats.peak],
                ["centroid Hz", Math.round(liveStats.centroid)],
                ["frames", liveStats.frames],
                ["fps", Math.round(liveStats.fps)],
              ]
            : [["waiting", "start recording"]],
        },
        {
          title: "emotion proxy",
          rows: liveStats
            ? [
                // 快速估算的"情绪强度"：RMS + 归一化的 centroid。
                // 不是最终 emotional_expressiveness 分数（那来自后端 F0 std），
                // 只是给一个实时可见的表达强度感。
                [
                  "intensity",
                  Math.min(
                    1,
                    liveStats.rms * 3 + Math.min(1, liveStats.centroid / 4000) * 0.3,
                  ),
                ],
                ["brightness", Math.min(1, liveStats.centroid / 4000)],
              ]
            : [["waiting", "-"]],
        },
      ]
    : [];

  return (
    <main className="relative min-h-screen bg-canvas text-ink overflow-hidden">
      <GradientBg intensity="soft" />
      {debug && <DebugOverlay sections={debugSections} />}
      <div className="relative z-10 flex flex-col items-center px-6 py-8">
        <div className="w-full max-w-[480px] flex flex-col items-center gap-6">
          <div className="w-full flex items-center justify-between">
            <Link
              href="/"
              className="text-sm text-muted hover:text-ink py-2 -mx-1 px-1 transition-colors"
              aria-label="返回"
            >
              ← 返回
            </Link>
            <div className="font-mono text-[11px] tracking-[0.35em] text-subtle">
              ECHOID
            </div>
          </div>

          {/* Topic card */}
          <div className="w-full grad-border rounded-2xl bg-surface/70 backdrop-blur-sm p-6 animate-fade-up">
            <div className="font-mono text-[10px] tracking-[0.3em] text-subtle mb-3">
              TODAY'S TOPIC
            </div>
            <p className="font-display font-medium text-xl leading-relaxed text-ink">
              {topic}
            </p>
          </div>

          {/* Waveform canvas */}
          <div className="w-full flex justify-center">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="rounded-lg"
              style={{ width: CANVAS_W, height: CANVAS_H }}
            />
          </div>

          {/* Record button + ring */}
          <div className="relative w-44 h-44 flex items-center justify-center">
            {phase === "idle" && (
              <div className="absolute inset-0 rounded-full bg-grad-primary opacity-30 blur-2xl animate-breathe" />
            )}
            {phase === "recording" && (
              <div className="absolute inset-0 rounded-full bg-accent/40 blur-2xl animate-pulse-glow" />
            )}
            <RecordRing progress={progress} danger={belowTen} phase={phase} />
            {phase === "recording" ? (
              <button
                onClick={doStop}
                disabled={!canStop}
                className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center text-canvas text-sm font-semibold transition ${
                  canStop
                    ? "bg-grad-primary bg-[length:200%_200%] animate-gradient-shift shadow-glow active:scale-95"
                    : "bg-surfaceHi text-muted"
                }`}
                aria-label="停止录音"
              >
                {canStop ? "停止" : `${Math.max(0, Math.ceil(MIN_SECONDS - elapsed))}s`}
              </button>
            ) : phase === "uploading" ? (
              <div className="relative z-10 w-24 h-24 rounded-full bg-surfaceHi border border-line flex items-center justify-center text-ink text-sm">
                <ShinyText>分析中…</ShinyText>
              </div>
            ) : (
              <button
                onClick={startRecording}
                className="relative z-10 w-24 h-24 rounded-full bg-grad-primary bg-[length:200%_200%] animate-gradient-shift text-canvas text-base font-semibold active:scale-95 shadow-glow transition"
                aria-label="开始录音"
              >
                按住说
              </button>
            )}
          </div>

          {/* Status line */}
          <div className="h-6 text-center text-sm text-muted font-mono">
            {phase === "idle" && (
              <span>准备好后按下按钮 · 讲 20–30 秒</span>
            )}
            {phase === "recording" && (
              <span className={belowTen ? "text-accent2" : "text-ink/80"}>
                {elapsed.toFixed(1)}s / 30s
                {!canStop && ` · 至少 ${MIN_SECONDS}s`}
              </span>
            )}
            {phase === "uploading" && (
              <GradientText as="span">上传中…请稍候</GradientText>
            )}
            {phase === "error" && (
              <span className="text-rose-400">{errorMsg || "出错了"}</span>
            )}
          </div>

          {phase === "error" && (
            <button
              onClick={() => {
                setPhase("idle");
                setErrorMsg("");
                setElapsed(0);
              }}
              className="text-sm underline text-muted hover:text-ink transition"
            >
              重试
            </button>
          )}

          <p className="mt-2 text-[11px] text-subtle text-center leading-relaxed font-mono">
            自然语速就好 · 可以停顿 · 可以笑 · 可以想一下
          </p>
        </div>
      </div>
    </main>
  );
}

function RecordRing({
  progress,
  danger,
  phase,
}: {
  progress: number;
  danger: boolean;
  phase: Phase;
}) {
  const R = 78;
  const C = 2 * Math.PI * R;
  const dashoffset = C * (1 - progress);
  const stroke = danger ? "#5EE7FF" : "#B37CFF";
  return (
    <svg
      viewBox="0 0 176 176"
      className="absolute inset-0 w-full h-full -rotate-90"
      aria-hidden
    >
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#B37CFF" />
          <stop offset="50%" stopColor="#5EE7FF" />
          <stop offset="100%" stopColor="#FFA1E0" />
        </linearGradient>
      </defs>
      <circle
        cx="88"
        cy="88"
        r={R}
        stroke="rgba(245,241,255,0.08)"
        strokeWidth="4"
        fill="none"
      />
      <circle
        cx="88"
        cy="88"
        r={R}
        stroke={phase === "recording" ? stroke : "url(#ringGrad)"}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={phase === "recording" ? dashoffset : 0}
        style={{
          transition: "stroke-dashoffset 0.1s linear",
          animation: danger ? "pulse-stroke 0.8s ease-in-out infinite" : undefined,
        }}
      />
      <style>{`
        @keyframes pulse-stroke {
          0%,100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </svg>
  );
}
