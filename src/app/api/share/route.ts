// POST /api/share
// Builds a shareable composite image (SVG) for a given result/card and
// persists it to `storage/cards/<cardId>.svg`. Updates Card.imageUrl and
// Card.qrUrl in Prisma. Returns { cardId, shareImageUrl, shareUrl }.
//
// Composition note: the PRD asked for a PNG via @vercel/og in Node runtime,
// but @vercel/og needs bundled CJK fonts to render Chinese, which the MVP
// doesn't ship. We emit an SVG at the same 1080×1350 canvas — browsers can
// download and embed it, and the Card.imageUrl field is agnostic to extension.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { saveCardFile, storageDir } from "@/lib/storage";
import { ROLE_LIBRARY } from "@/lib/roles/library";
import { PERSONAS } from "@/lib/personas/personas";
import { SUBSYSTEM_TITLES } from "@/lib/matching/config";
import type { Dimension } from "@/types/core";

export const runtime = "nodejs";

type Body = {
  resultId?: string | null;
  cardId?: string | null;
};

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* fall through to query params */
  }
  const url = new URL(req.url);
  const resultId = body.resultId ?? url.searchParams.get("resultId") ?? null;
  const cardIdHint = body.cardId ?? url.searchParams.get("cardId") ?? null;

  if (!resultId && !cardIdHint) {
    return NextResponse.json(
      { error: "resultId or cardId required" },
      { status: 400 },
    );
  }

  const result = await prisma.analysisResult.findFirst({
    where: resultId
      ? { id: resultId }
      : { card: { id: cardIdHint ?? undefined } },
    include: { card: true },
  });

  if (!result) {
    return NextResponse.json({ error: "result not found" }, { status: 404 });
  }

  // Reuse an existing card row if one is already attached; otherwise mint a
  // deterministic id from the resultId so repeat calls are idempotent.
  const cardId =
    result.card?.id ??
    `card_${result.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20)}`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shareUrl = `/s/${cardId}`;
  const absoluteShareUrl = `${appUrl.replace(/\/$/, "")}${shareUrl}`;

  const qrDataUrl = await QRCode.toDataURL(absoluteShareUrl, {
    margin: 0,
    width: 200,
    color: { dark: "#0e0e10", light: "#f5f2eaff" },
  });

  // Validate dimensions decode; we don't render them into the composite yet
  // but bad JSON should surface as a 500 rather than a silent skip.
  let dimensions: Dimension[] = [];
  if (result.dimensionsJson) {
    try {
      dimensions = JSON.parse(result.dimensionsJson) as Dimension[];
    } catch {
      dimensions = [];
    }
  }

  const posterDataUrl = await inlineLocalImageAsDataUrl(result.imageUrl);

  // Two flavors of share card:
  //   VBTI       — matchedPersonaId + matchedSubsystem set. Show 判决书:
  //                「你演得像」 / <subsystemTitle · personaTitle>.
  //   legacy     — old EchoID path. Show 「你说话像」 / roleTitle.
  const isVbti = !!result.matchedPersonaId && !!result.matchedSubsystem;
  const persona =
    isVbti && result.matchedPersonaId
      ? PERSONAS.find((p) => p.id === result.matchedPersonaId)
      : undefined;
  const subsystemTitle =
    isVbti && result.matchedSubsystem
      ? SUBSYSTEM_TITLES[result.matchedSubsystem as keyof typeof SUBSYSTEM_TITLES]
      : "";
  const roleTitle = isVbti
    ? persona?.title ?? result.matchedPersonaId ?? ""
    : ROLE_LIBRARY.find((r) => r.id === result.matchedRoleId)?.title ??
      result.matchedRoleId ??
      "";

  const svg = composeShareSvg({
    isVbti,
    posterDataUrl,
    roleTitle,
    subsystemTitle,
    headline: result.headline,
    qrDataUrl,
    dimensions,
  });

  const { relPath } = await saveCardFile({
    id: cardId,
    ext: "svg",
    data: svg,
  });

  // saveCardFile hands back `/storage/cards/<id>.svg`; our public serving
  // handler lives at `/api/storage/...`. Rewrite to the served URL.
  const servedUrl = relPath.replace(/^\/storage\//, "/api/storage/");

  await prisma.card.upsert({
    where: { id: cardId },
    create: {
      id: cardId,
      resultId: result.id,
      imageUrl: servedUrl,
      qrUrl: qrDataUrl,
      isPublic: true,
    },
    update: {
      imageUrl: servedUrl,
      qrUrl: qrDataUrl,
    },
  });

  return NextResponse.json({
    cardId,
    shareImageUrl: servedUrl,
    shareUrl,
  });
}

/** Read a local image (from /storage/... or /personas/... or bare path) and
 * return a data: URL for inlining. Falls back through storage/, public/,
 * and repo root to be robust against the multiple asset locations we ship
 * (VBTI portraits live under public/personas/, legacy mock SVGs live under
 * storage/images/, etc.). */
async function inlineLocalImageAsDataUrl(
  urlOrPath: string,
): Promise<string | null> {
  if (!urlOrPath) return null;
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;

  // Try each candidate root in order — first one that exists wins.
  const stripped = urlOrPath
    .replace(/^\/api\/storage\//, "")
    .replace(/^\/storage\//, "")
    .replace(/^\/personas\//, "personas/")
    .replace(/^\/+/, "");
  const candidates = [
    path.join(storageDir, stripped),
    path.join(process.cwd(), "public", stripped),
    path.join(process.cwd(), stripped),
  ];

  for (const abs of candidates) {
    try {
      const buf = await fs.readFile(abs);
      const ext = path.extname(abs).slice(1).toLowerCase();
      const mime =
        ext === "svg"
          ? "image/svg+xml"
          : ext === "png"
            ? "image/png"
            : ext === "jpg" || ext === "jpeg"
              ? "image/jpeg"
              : ext === "webp"
                ? "image/webp"
                : "application/octet-stream";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/** XML-safe escape for text nodes and attribute values. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Compose the 1080×1350 share image as an SVG string. Two flavors:
 *   isVbti=true  → VBTI 判决书 poster (dark ink background, rust red +
 *                  copper accents, 「你演得像」 eyebrow, subsystem·persona
 *                  title, headline body, VBTI watermark, QR corner).
 *   isVbti=false → legacy EchoID poster (kept intact for old cards).
 */
function composeShareSvg(opts: {
  isVbti: boolean;
  posterDataUrl: string | null;
  roleTitle: string;
  subsystemTitle: string;
  headline: string;
  qrDataUrl: string;
  dimensions: Dimension[];
}): string {
  return opts.isVbti
    ? composeVbtiSvg(opts)
    : composeLegacySvg(opts);
}

function composeVbtiSvg(opts: {
  posterDataUrl: string | null;
  roleTitle: string;
  subsystemTitle: string;
  headline: string;
  qrDataUrl: string;
}): string {
  const W = 1080;
  const H = 1350;
  const posterSize = 720;
  const posterX = (W - posterSize) / 2;
  const posterY = 120;

  const qrSize = 168;
  const qrX = W - qrSize - 60;
  const qrY = H - qrSize - 60;

  const headlineLines = wrapCjk(opts.headline, 16).slice(0, 2);

  // VBTI palette (mirrors tailwind.config.ts).
  const INK = "#1A1A1A";
  const CARD_DARK = "#2A2520";
  const RUST = "#C44B2F";
  const COPPER = "#E8B87A";
  const COPPER_DIM = "#B8905A";
  const PAPER = "#F5F0E8";
  const PAPER_DIM = "#C8C0B4";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="spot" cx="82%" cy="8%" r="60%">
      <stop offset="0%" stop-color="${COPPER}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${COPPER}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="posterClip">
      <rect x="${posterX}" y="${posterY}" width="${posterSize}" height="${posterSize}" rx="8" ry="8"/>
    </clipPath>
  </defs>

  <!-- background: warm dark + copper spotlight -->
  <rect width="${W}" height="${H}" fill="${INK}"/>
  <rect width="${W}" height="${H}" fill="url(#spot)"/>

  <!-- CASE FILE header rule -->
  <text x="60" y="70" font-family="'JetBrains Mono','SF Mono','Menlo',monospace"
        font-size="18" fill="${COPPER_DIM}" letter-spacing="7">CASE FILE · VBTI</text>
  <text x="${W - 60}" y="70" text-anchor="end" font-family="'JetBrains Mono','SF Mono',monospace"
        font-size="18" fill="${COPPER_DIM}" letter-spacing="5">已实锤</text>
  <line x1="60" y1="90" x2="${W - 60}" y2="90"
        stroke="${COPPER_DIM}" stroke-width="1" stroke-dasharray="4 6" stroke-opacity="0.55"/>

  <!-- poster frame + rivets + image -->
  <rect x="${posterX - 12}" y="${posterY - 12}" width="${posterSize + 24}" height="${posterSize + 24}"
        rx="12" ry="12" fill="none" stroke="${COPPER}" stroke-width="2" stroke-opacity="0.7"/>
  <rect x="${posterX}" y="${posterY}" width="${posterSize}" height="${posterSize}"
        rx="8" ry="8" fill="${CARD_DARK}"/>
  ${
    opts.posterDataUrl
      ? `<image href="${esc(opts.posterDataUrl)}" x="${posterX}" y="${posterY}" width="${posterSize}" height="${posterSize}" preserveAspectRatio="xMidYMid meet" clip-path="url(#posterClip)"/>`
      : ""
  }
  ${["-12,-12", `${posterSize},-12`, "-12," + posterSize, `${posterSize},${posterSize}`]
    .map((p) => {
      const [dx, dy] = p.split(",").map(Number);
      return `<circle cx="${posterX + dx}" cy="${posterY + dy}" r="6" fill="${COPPER}" stroke="${INK}" stroke-width="2"/>`;
    })
    .join("")}

  <!-- eyebrow -->
  <text x="${W / 2}" y="${posterY + posterSize + 76}" text-anchor="middle"
        font-family="'JetBrains Mono','SF Mono',monospace" font-size="20"
        fill="${COPPER}" letter-spacing="8">SUSPECT · 你演得像</text>

  <!-- subsystem · persona -->
  <text x="${W / 2}" y="${posterY + posterSize + 158}" text-anchor="middle"
        font-family="'PingFang SC','Hiragino Sans GB',sans-serif" font-size="70"
        font-weight="900" fill="${PAPER}" letter-spacing="4">${esc((opts.subsystemTitle ? opts.subsystemTitle + "·" : "") + opts.roleTitle)}</text>

  <!-- rust underline accent -->
  <rect x="${W / 2 - 90}" y="${posterY + posterSize + 180}" width="180" height="3" fill="${RUST}"/>

  <!-- headline body (max 2 lines) -->
  ${headlineLines
    .map(
      (line, i) => `
  <text x="${W / 2}" y="${posterY + posterSize + 244 + i * 44}" text-anchor="middle"
        font-family="'PingFang SC','Hiragino Sans GB',sans-serif" font-size="30"
        fill="${PAPER_DIM}">${esc(line)}</text>`,
    )
    .join("")}

  <!-- watermark bottom-left -->
  <text x="60" y="${H - 96}" font-family="'PingFang SC','Songti SC',serif"
        font-size="42" font-weight="700" fill="${PAPER}">声音照妖镜</text>
  <text x="60" y="${H - 66}" font-family="'JetBrains Mono','SF Mono',monospace"
        font-size="17" fill="${COPPER_DIM}" letter-spacing="4">60 秒声学取证 · 扫码去自首</text>

  <!-- QR bottom-right on paper backdrop -->
  <rect x="${qrX - 12}" y="${qrY - 12}" width="${qrSize + 24}" height="${qrSize + 24}"
        rx="6" ry="6" fill="${PAPER}"/>
  <image href="${esc(opts.qrDataUrl)}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
</svg>`;
}

function composeLegacySvg(opts: {
  posterDataUrl: string | null;
  roleTitle: string;
  headline: string;
  qrDataUrl: string;
}): string {
  const W = 1080;
  const H = 1350;
  const posterSize = 720;
  const posterX = (W - posterSize) / 2;
  const posterY = 90;

  const qrSize = 180;
  const qrX = W - qrSize - 60;
  const qrY = H - qrSize - 60;

  const headlineLines = wrapCjk(opts.headline, 18).slice(0, 3);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#f5f2ea"/>

  <clipPath id="posterClip">
    <rect x="${posterX}" y="${posterY}" width="${posterSize}" height="${posterSize}" rx="24" ry="24"/>
  </clipPath>
  <rect x="${posterX}" y="${posterY}" width="${posterSize}" height="${posterSize}" rx="24" ry="24" fill="#0e0e10"/>
  ${
    opts.posterDataUrl
      ? `<image href="${esc(opts.posterDataUrl)}" x="${posterX}" y="${posterY}" width="${posterSize}" height="${posterSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#posterClip)"/>`
      : ""
  }

  <text x="${W / 2}" y="${posterY + posterSize + 90}" text-anchor="middle"
        font-family="'Noto Serif SC', 'Songti SC', serif" font-size="24"
        fill="#0e0e10" fill-opacity="0.55" letter-spacing="10">你 说 话 像</text>
  <text x="${W / 2}" y="${posterY + posterSize + 170}" text-anchor="middle"
        font-family="'Noto Serif SC', 'Songti SC', serif" font-size="72"
        fill="#0e0e10" font-weight="600">${esc(opts.roleTitle)}</text>

  ${headlineLines
    .map(
      (line, i) => `
  <text x="${W / 2}" y="${posterY + posterSize + 240 + i * 50}" text-anchor="middle"
        font-family="'PingFang SC', 'Hiragino Sans GB', sans-serif" font-size="32"
        fill="#0e0e10" fill-opacity="0.75">${esc(line)}</text>`,
    )
    .join("")}

  <text x="60" y="${H - 90}" font-family="serif" font-size="40" font-weight="600" fill="#0e0e10">EchoID</text>
  <text x="60" y="${H - 60}" font-family="sans-serif" font-size="18" fill="#0e0e10" fill-opacity="0.5">扫码测测你说话像谁</text>

  <image href="${esc(opts.qrDataUrl)}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
</svg>`;
}

/** Naive CJK wrapper — Chinese text is monospaced enough that char-count works. */
function wrapCjk(text: string, perLine: number): string[] {
  const out: string[] = [];
  const t = (text || "").trim();
  for (let i = 0; i < t.length; i += perLine) {
    out.push(t.slice(i, i + perLine));
  }
  return out;
}
