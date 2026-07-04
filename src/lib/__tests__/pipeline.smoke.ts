// End-to-end smoke test for the analysis pipeline.
// Run via: `npx tsx src/lib/__tests__/pipeline.smoke.ts`
//
// Depends on sibling agents (feature extraction, scoring, roles) being present.
// If any of those imports are missing this script will fail at import time.

import { promises as fs } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { runAnalysisPipeline } from "@/lib/pipeline";
import { prisma } from "@/lib/prisma";
import { storageDir } from "@/lib/storage";

const TMP_AUDIO = "/tmp/echoid_test.wav";

async function ensureTestAudio(): Promise<string> {
  try {
    const s = await fs.stat(TMP_AUDIO);
    if (s.isFile() && s.size > 1024) return TMP_AUDIO;
  } catch {
    /* fallthrough */
  }
  // Synthesize a 5-second sine wave via ffmpeg.
  execFileSync(
    "ffmpeg",
    [
      "-f", "lavfi",
      "-i", "sine=frequency=220:duration=5",
      "-ac", "1",
      "-ar", "16000",
      TMP_AUDIO,
      "-y",
    ],
    { stdio: "inherit" },
  );
  return TMP_AUDIO;
}

async function main(): Promise<void> {
  const audioPath = await ensureTestAudio();
  const ownerAnon = "smoke-" + crypto.randomUUID();

  console.log(`[smoke] audio: ${audioPath}`);
  console.log(`[smoke] ownerAnon: ${ownerAnon}`);

  const out = await runAnalysisPipeline({
    audioPath,
    mimeType: "audio/wav",
    ownerAnon,
  });

  // 1) DB rows exist.
  const rec = await prisma.recording.findUnique({ where: { id: out.recording.id } });
  const res = await prisma.analysisResult.findUnique({ where: { id: out.result.id } });
  const card = await prisma.card.findUnique({ where: { id: out.card.id } });
  if (!rec) throw new Error("Recording row missing after pipeline");
  if (!res) throw new Error("AnalysisResult row missing after pipeline");
  if (!card) throw new Error("Card row missing after pipeline");

  // 2) Image file written under storage/images/
  const imgRel = out.result.imageUrl.replace(/^\/storage\//, "");
  const imgAbs = path.join(storageDir, imgRel);
  const imgStat = await fs.stat(imgAbs);
  if (!imgStat.isFile() || imgStat.size <= 0) {
    throw new Error(`Image not written or empty: ${imgAbs}`);
  }

  // 3) Card shape.
  if (card.resultId !== res.id) throw new Error("Card.resultId mismatch");
  if (card.imageUrl !== res.imageUrl) throw new Error("Card.imageUrl mismatch");

  // 4) Full payload.
  const features = JSON.parse(res.featuresJson ?? "{}");
  const dimensions = JSON.parse(res.dimensionsJson ?? "[]");

  const payload = {
    recordingId: rec.id,
    resultId: res.id,
    cardId: card.id,
    ownerAnon: rec.ownerAnon,
    duration: rec.duration,
    status: rec.status,
    expiresAt: rec.expiresAt,
    headline: res.headline,
    matchedRoleId: res.matchedRoleId,
    imageUrl: res.imageUrl,
    cardCopy: res.cardCopy,
    transcript: res.transcript,
    features,
    dimensions,
  };

  console.log("[smoke] OK");
  console.log(JSON.stringify(payload, null, 2));
}

main()
  .catch((err) => {
    console.error("[smoke] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
