import { headers } from "next/headers";
import ResultReveal from "./ResultReveal";
import { AgedCard, CaseId, ChainDivider, RustButton } from "@/components/vbti/material";
import type {
  AnalyzePartialResponse,
  AnalyzeSegmentedPartialResponse,
} from "@/types/core";

// The partial the page hands to <ResultReveal /> may be either a VBTI
// segmented partial (matchedSubsystem present) or a legacy EchoID one.
// The component branches at render time on `matchedSubsystem`.
export type ResultPartial =
  | (AnalyzeSegmentedPartialResponse & { roleTitle?: string })
  | AnalyzePartialResponse;

function getBaseUrl() {
  const h = headers();
  const proto =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function fetchPartial(
  base: string,
  resultId: string,
): Promise<ResultPartial | null> {
  try {
    const res = await fetch(
      `${base}/api/analyze?resultId=${encodeURIComponent(resultId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as ResultPartial;
  } catch {
    return null;
  }
}

export default async function ResultPage({
  params,
}: {
  params: { resultId: string };
}) {
  const base = getBaseUrl();
  const partial = await fetchPartial(base, params.resultId);

  // Missing / expired result — render a small "档案不存在" ledger card
  // instead of blowing up with 404. The UX is the same as legacy but
  // spoken in the VBTI archive-noir voice.
  if (!partial) {
    const short = params.resultId.slice(0, 6).toUpperCase() || "??????";
    return (
      <main className="relative min-h-screen text-paper overflow-hidden flex flex-col items-center justify-center px-6 py-16">
        <div className="relative z-10 w-full max-w-[420px] flex flex-col gap-6">
          <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.35em] text-copperDim uppercase">
            <span>· 档案室 ·</span>
            <span>Nº {short}</span>
          </div>
          <AgedCard rotate={-1.5} pin="right" className="text-inkText">
            <div className="flex flex-col gap-4 py-2">
              <CaseId n={short} label="MISSING FILE" />
              <h1 className="font-display text-4xl leading-tight">
                档案不存在
              </h1>
              <p className="text-sm leading-relaxed text-inkText/80">
                这份声音档案已经从卷宗里消失。可能是链接过期,
                或者当事人还没走完录音这一关。
              </p>
              <div className="font-mono text-[11px] tracking-[0.2em] text-inkText/50 uppercase border-t border-inkText/15 pt-3">
                Status · 404 · Not Filed
              </div>
            </div>
          </AgedCard>
          <RustButton as="a" href="/">
            重新走一遍取证流程
          </RustButton>
          <ChainDivider />
        </div>
      </main>
    );
  }

  return <ResultReveal resultId={params.resultId} partial={partial} />;
}
