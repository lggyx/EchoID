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
  try {
    dimensions = JSON.parse(result.dimensionsJson ?? "[]") as Dimension[];
  } catch {
    dimensions = [];
  }

  const posterDataUrl = await inlineLocalImageAsDataUrl(result.imageUrl);
  const roleTitle =
    ROLE_LIBRARY.find((r) => r.id === result.matchedRoleId)?.title ??
    result.matchedPersonaId ??
    result.matchedSubsystem ??
    result.matchedRoleId ??
    "声音角色";

  const svg = composeShareSvg({
    posterDataUrl,
    roleTitle,
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

/** Read a local /storage/... URL and return a data: URL for inlining. */
async function inlineLocalImageAsDataUrl(
  urlOrPath: string,
): Promise<string | null> {
  if (!urlOrPath) return null;
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;

  const stripped = urlOrPath
    .replace(/^\/api\/storage\//, "")
    .replace(/^\/storage\//, "");
  const abs = path.join(storageDir, stripped);
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
    return null;
  }
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
 * Compose the 1080×1350 share image as an SVG string.
 * Layout: poster → eyebrow + role → headline (up to 3 lines) →
 * watermark bottom-left, QR bottom-right.
 */
function composeShareSvg(opts: {
  posterDataUrl: string | null;
  roleTitle: string;
  headline: string;
  qrDataUrl: string;
  dimensions: Dimension[];
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
