import Link from "next/link";
import GradientText from "@/components/GradientText";
import ShinyText from "@/components/ShinyText";
import GradientBg from "@/components/GradientBg";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-canvas text-ink">
      <GradientBg intensity="normal" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="w-full px-6 py-5 flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-[0.35em] text-muted">
            ECHOID
          </span>
          <span className="font-mono text-[10px] tracking-[0.3em] text-subtle">
            v0.1 · MVP
          </span>
        </header>

        <section className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="max-w-[520px] flex flex-col items-center gap-8 animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[11px] font-mono tracking-wider text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <ShinyText>listening to how you speak</ShinyText>
            </div>

            <h1 className="font-display font-medium leading-[1.05] text-[56px] sm:text-[72px] tracking-tight">
              <span className="block text-ink">你说话</span>
              <GradientText as="span" className="block">
                像谁?
              </GradientText>
            </h1>

            <p className="text-base sm:text-lg text-muted leading-relaxed max-w-[420px]">
              对着麦克风说 20–30 秒,EchoID 用真实的
              <span className="text-ink"> 声学特征 </span>
              画出一张属于你的说话风格卡片。
            </p>

            <div className="flex flex-col items-center gap-3 mt-2">
              <Link
                href="/record"
                className="group relative inline-flex items-center gap-2 rounded-full bg-grad-primary bg-[length:200%_200%] animate-gradient-shift text-canvas font-medium px-8 py-4 text-base shadow-glow active:scale-[0.98] transition"
              >
                <span>开始录音</span>
                <span aria-hidden className="translate-x-0 group-hover:translate-x-1 transition-transform">→</span>
              </Link>
              <p className="text-[11px] text-subtle font-mono tracking-wider">
                microphone required · audio auto-deletes in 24h
              </p>
            </div>
          </div>
        </section>

        <FeatureRow />

        <footer className="px-6 py-6 text-center">
          <p className="text-[11px] text-subtle font-mono tracking-wider">
            not a personality test · just how you sound
          </p>
        </footer>
      </div>
    </main>
  );
}

function FeatureRow() {
  const items: [string, string][] = [
    ["01", "语速 · 停顿 · 语气词"],
    ["02", "音调起伏 · 音量动态"],
    ["03", "12 个说话人角色"],
  ];
  return (
    <section className="px-6 pb-10 flex justify-center">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-[720px]">
        {items.map(([n, label]) => (
          <div
            key={n}
            className="grad-border rounded-2xl bg-surface/60 backdrop-blur-sm px-5 py-4 text-left"
          >
            <div className="font-mono text-[10px] tracking-[0.25em] text-subtle mb-2">
              {n}
            </div>
            <div className="text-sm text-ink/85">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
