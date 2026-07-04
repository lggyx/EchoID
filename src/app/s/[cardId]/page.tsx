/**
 * VBTI · 声音照妖镜 public share landing.
 *
 * Given a `cardId` this page fetches the card from `/api/card/<id>` and
 * renders a compact 判决书 view. It handles two shapes in the same file:
 *  - VBTI (matchedSubsystem present)  → full 判决书 hero.
 *  - Legacy EchoID (roleTitle present) → graceful fallback.
 *
 * The server component owns the fetch + metadata. Layout applies ambient
 * spotlight+grain in the root layout — do NOT re-add here.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type {
  AnalyzeFullResponse,
  AnalyzeSegmentedFullResponse,
} from "@/types/core";
import {
  AgedCard,
  CaseId,
  ChainDivider,
  CopperButton,
  ExhibitTag,
  RustButton,
  Stamp,
} from "@/components/vbti/material";

/** Union of the two known card shapes the API may return. Fields are
 *  partial because legacy VBTI rows may be missing `subsystemTitle`. */
type CardPayload = Partial<AnalyzeFullResponse> &
  Partial<AnalyzeSegmentedFullResponse> & {
    cardId?: string;
    headline?: string;
    imageUrl?: string;
    cardCopy?: string;
  };

function getBaseUrl(): string {
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
): Promise<CardPayload | null> {
  try {
    const res = await fetch(
      `${base}/api/card/${encodeURIComponent(cardId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as CardPayload;
  } catch {
    return null;
  }
}

/** OG images need to be fully qualified even though the origin serves them
 *  from a relative /api/storage path. */
function absolutize(base: string, maybeRelative: string | undefined): string | undefined {
  if (!maybeRelative) return undefined;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${base.replace(/\/$/, "")}${maybeRelative.startsWith("/") ? "" : "/"}${maybeRelative}`;
}

/** Turn a headline like "你说话像 · 深夜档情感主播" into "深夜档情感主播".
 *  Falls back to the headline itself, or "未知人格" when empty. */
function derivePersonaTitle(headline: string | undefined): string {
  if (!headline) return "未知人格";
  let s = headline.trim();
  // Strip common leading verbs from the VBTI copy.
  s = s.replace(/^你演得像[:：·\s]*/, "");
  s = s.replace(/^你说话像[:：·\s]*/, "");
  // If a · separator remains, take the trailing chunk (persona name).
  if (s.includes("·")) {
    const parts = s.split("·").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) s = parts[parts.length - 1];
  }
  return s || "未知人格";
}

/** First-sentence extractor for the judgment line. */
function firstSentence(text: string | undefined): string {
  if (!text) return "";
  const m = text.match(/^[^。！？!?\n]+[。！？!?]?/);
  return (m ? m[0] : text).trim();
}

export async function generateMetadata({
  params,
}: {
  params: { cardId: string };
}): Promise<Metadata> {
  const base = getBaseUrl();
  const card = await fetchCard(base, params.cardId);
  const personaTitle = derivePersonaTitle(card?.headline);
  const title = card
    ? `${personaTitle} · 声音照妖镜判决书`
    : "声音照妖镜 · 判决书";
  const description =
    card?.headline ??
    card?.cardCopy ??
    "60 秒声学取证。系统只听声音,不问对错,给你一份判决书。";
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
    return <NotFoundView />;
  }

  const isVbti = Boolean(card.matchedSubsystem);
  const personaTitle = derivePersonaTitle(card.headline);
  const judgment = firstSentence(card.headline) || firstSentence(card.cardCopy);
  const shortId = params.cardId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "XXXX";
  const subsystemLabel = card.subsystemTitle ?? "判决书";

  return (
    <main className="relative min-h-screen text-paper overflow-x-hidden">
      <div className="relative z-10 mx-auto w-full max-w-[440px] px-safe-x pt-6 pb-10 flex flex-col gap-5">
        {/* ── Top meta row ── */}
        <header className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.28em] text-copperDim uppercase">
            Case File Nº {shortId}
          </span>
          <Stamp text="已实锤" size="sm" rotate={-9} drop={false} />
        </header>

        {/* ── Portrait framed as aged-paper exhibit ── */}
        <AgedCard rotate={-1} pin="right" className="w-full">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <CaseId
                n={shortId}
                label={isVbti ? "证物档案" : "档案编号"}
              />
              <ExhibitTag label={isVbti ? subsystemLabel : "EchoID"} />
            </div>
            <div
              className="relative w-full overflow-hidden rounded-sharp bg-cardDarker"
              style={{
                aspectRatio: "1 / 1",
                boxShadow:
                  "inset 0 0 0 1px rgba(31,26,21,0.3), 0 2px 4px rgba(0,0,0,0.35)",
              }}
            >
              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.imageUrl}
                  alt={personaTitle}
                  className="w-full h-full object-cover block"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-mono text-[11px] text-paperMuted tracking-[0.2em] uppercase">
                  No Portrait
                </div>
              )}
            </div>
          </div>
        </AgedCard>

        {/* ── Suspect line ── */}
        <AgedCard rotate={0.6} className="w-full">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.25em] text-inkText/60 uppercase">
              Suspect · 嫌疑人格
            </span>
            <span className="font-heading font-black text-[22px] leading-tight text-inkText">
              {personaTitle}
            </span>
          </div>
        </AgedCard>

        {/* ── Judgment line ── */}
        {judgment ? (
          <AgedCard rotate={-0.8} pin="left" className="w-full">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-[0.25em] text-inkText/60 uppercase">
                Judgment · 判词
              </span>
              <p className="font-heading font-black text-judgment text-inkText leading-snug">
                {judgment}
              </p>
              {card.cardCopy && card.cardCopy !== judgment && (
                <p className="text-body text-inkText/75 leading-relaxed pt-1">
                  {card.cardCopy}
                </p>
              )}
            </div>
          </AgedCard>
        ) : null}

        <ChainDivider />

        {/* ── CTA row ── */}
        <div className="flex flex-col items-stretch gap-3">
          <RustButton
            as="a"
            href="/"
            className="text-[15px] py-3.5 tracking-[0.18em] text-center"
          >
            我也去自首 →
          </RustButton>
          <CopperButton as="a" href="/" className="text-center">
            回到档案室
          </CopperButton>
        </div>

        <p className="pt-4 text-center font-mono text-[10px] tracking-[0.2em] uppercase text-paperMuted leading-relaxed">
          结果基于本次录音的声学特征
          <br />
          仅供娱乐 · 不作为人格鉴定
        </p>
      </div>
    </main>
  );
}

function NotFoundView() {
  return (
    <main className="relative min-h-screen text-paper flex items-center justify-center px-safe-x">
      <div className="relative z-10 w-full max-w-[440px] flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.28em] text-copperDim uppercase">
            Case File Nº ????
          </span>
          <Stamp text="失踪" size="sm" rotate={-10} drop={false} color="#8A8278" />
        </div>

        <AgedCard rotate={-1.2} pin="left" className="w-full">
          <div className="flex flex-col gap-3">
            <CaseId n="??" label="档案不存在" />
            <h1 className="font-heading font-black text-h2 text-inkText leading-tight">
              这份判决书<br />已经归档或从未存在
            </h1>
            <p className="text-body text-inkText/70 leading-relaxed">
              链接可能已过期,或案卷被删除。<br />
              你可以自己走一次 60 秒声学取证。
            </p>
          </div>
        </AgedCard>

        <ChainDivider />

        <RustButton
          as="a"
          href="/"
          className="text-[15px] py-3.5 tracking-[0.18em] text-center"
        >
          开始录口供 →
        </RustButton>

        <Link href="/" className="sr-only">
          回到首页
        </Link>
      </div>
    </main>
  );
}
