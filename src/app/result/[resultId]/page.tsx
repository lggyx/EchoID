import Link from "next/link";
import { headers } from "next/headers";
import ResultReveal from "./ResultReveal";
import type { AnalyzePartialResponse } from "@/types/core";

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
): Promise<AnalyzePartialResponse | null> {
  try {
    const res = await fetch(
      `${base}/api/analyze?resultId=${encodeURIComponent(resultId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as AnalyzePartialResponse;
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

  if (!partial) {
    return (
      <main className="relative min-h-screen bg-canvas text-ink overflow-hidden flex flex-col items-center justify-center px-6 py-16">
        <div className="relative z-10 w-full max-w-[480px] text-center flex flex-col gap-6">
          <div className="font-mono text-[11px] tracking-[0.35em] text-muted">
            ECHOID
          </div>
          <h1 className="font-display text-2xl">结果还在准备中…</h1>
          <p className="text-sm text-muted leading-relaxed">
            我们没有找到这份结果。可能是链接失效,或分析还没完成。
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full bg-grad-primary text-canvas px-6 py-3 text-sm font-medium shadow-glow"
          >
            重新录一段
          </Link>
        </div>
      </main>
    );
  }

  return <ResultReveal resultId={params.resultId} partial={partial} />;
}
