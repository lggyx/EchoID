import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { AnalyzeFullResponse } from "@/types/core";
import GradientBg from "@/components/GradientBg";
import GradientText from "@/components/GradientText";

function getBaseUrl() {
  const h = headers();
  const proto =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function fetchCard(
  base: string,
  cardId: string,
): Promise<AnalyzeFullResponse | null> {
  try {
    const res = await fetch(
      `${base}/api/card/${encodeURIComponent(cardId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as AnalyzeFullResponse;
  } catch {
    return null;
  }
}

/** Absolute URL helper — the share image lives at /api/storage/... on the
 * server, but OG tags need to be fully qualified. */
function absolutize(base: string, maybeRelative: string): string {
  if (!maybeRelative) return base;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${base.replace(/\/$/, "")}${maybeRelative.startsWith("/") ? "" : "/"}${maybeRelative}`;
}

export async function generateMetadata({
  params,
}: {
  params: { cardId: string };
}): Promise<Metadata> {
  const base = getBaseUrl();
  const card = await fetchCard(base, params.cardId);
  const title = card
    ? `我说话像${card.roleTitle} · EchoID`
    : "EchoID · 你说话像谁";
  const description = card?.headline ?? "对着麦克风讲 20–30 秒,给你画一张说话风格卡片。";
  const image = card ? absolutize(base, card.imageUrl) : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [image] : undefined,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ShareLandingPage({
  params,
}: {
  params: { cardId: string };
}) {
  const base = getBaseUrl();
  const card = await fetchCard(base, params.cardId);

  if (!card) {
    return (
      <main className="relative min-h-screen bg-canvas text-ink overflow-hidden flex flex-col items-center justify-center px-6 py-16">
        <GradientBg intensity="soft" />
        <div className="relative z-10 w-full max-w-[480px] text-center flex flex-col gap-6">
          <div className="font-mono text-[11px] tracking-[0.35em] text-muted">
            ECHOID
          </div>
          <h1 className="font-display text-2xl">这张卡片不见了</h1>
          <p className="text-sm text-muted leading-relaxed">
            链接可能失效,或者卡片已被删除。你也可以自己录一段。
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full bg-grad-primary text-canvas px-6 py-3 text-sm font-medium shadow-glow"
          >
            我也测一个
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-canvas text-ink overflow-hidden px-6 py-8">
      <GradientBg intensity="soft" />
      <div className="relative z-10 w-full max-w-[480px] mx-auto flex flex-col gap-6 pb-12">
        <div className="font-mono text-[11px] tracking-[0.35em] text-muted text-center">
          ECHOID
        </div>

        <div className="w-full rounded-3xl overflow-hidden grad-border bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.imageUrl}
            alt={card.roleTitle}
            className="w-full h-auto block"
          />
        </div>

        <header className="text-center flex flex-col gap-3">
          <div className="font-mono text-[10px] tracking-[0.3em] text-subtle">
            THEY SOUND LIKE
          </div>
          <h1 className="font-display font-medium text-4xl leading-tight">
            <GradientText as="span">{card.roleTitle}</GradientText>
          </h1>
          <p className="text-sm text-muted leading-relaxed">{card.headline}</p>
        </header>

        <Link
          href="/"
          className="w-full text-center rounded-full bg-grad-primary bg-[length:200%_200%] animate-gradient-shift text-canvas py-4 text-base font-semibold shadow-glow active:scale-[0.98] transition"
        >
          我也测一个
        </Link>

        <p className="text-[11px] text-subtle text-center leading-relaxed font-mono">
          结果基于本次录音的声学特征 · 仅供娱乐
        </p>
      </div>
    </main>
  );
}
