// Smoke test for VBTI segmented pipeline core.
// Run:
//   container exec echoid-dev bash -lc \
//     "cd /app && npx tsx --env-file=.env src/lib/__tests__/segmented-pipeline.smoke.ts"

import { writeFileSync } from "node:fs";
import { WaveFile } from "wavefile";
import { runSegmentedAnalysisPipeline } from "@/lib/pipeline-segmented";
import { prisma } from "@/lib/prisma";

process.env.ASR_PROVIDER = "mock";
process.env.LLM_API_KEY = "";
process.env.IMAGE_PROVIDER = "mock";

const SR = 16_000;
const DUR_SEC = 2;

function writeSine(path: string, freq: number): void {
  const samples = new Int16Array(SR * DUR_SEC);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / SR) * 12_000);
  }
  const wav = new WaveFile();
  wav.fromScratch(1, SR, "16", samples);
  writeFileSync(path, Buffer.from(wav.toBuffer()));
}

async function main(): Promise<void> {
  const paths = [220, 260, 300, 340, 380].map((freq, i) => {
    const path = `/tmp/vbti_segmented_${i + 1}.wav`;
    writeSine(path, freq);
    return path;
  });

  const out = await runSegmentedAnalysisPipeline({
    ownerAnon: `segmented-smoke-${crypto.randomUUID()}`,
    stageDirection: "random",
    segments: paths.map((audioPath) => ({ audioPath, mimeType: "audio/wav" })),
  });

  if (!out.recordingId || !out.resultId || !out.cardId) throw new Error("missing ids");
  if (!["film", "variety", "stage", "robot", "street"].includes(out.matchedSubsystem)) {
    throw new Error(`unknown subsystem ${out.matchedSubsystem}`);
  }
  if (!out.matchedPersonaId) throw new Error("missing persona id");
  if (out.contrastRateAvg < 0 || out.contrastRateAvg > 100) {
    throw new Error(`contrastRateAvg out of range: ${out.contrastRateAvg}`);
  }

  const segmentCount = await prisma.recordingSegment.count({ where: { recordingId: out.recordingId } });
  if (segmentCount !== 5) throw new Error(`expected 5 persisted segments, got ${segmentCount}`);

  const result = await prisma.analysisResult.findUnique({ where: { id: out.resultId } });
  if (!result?.matchedSubsystem || !result.matchedPersonaId || !result.evidenceJson) {
    throw new Error("persisted VBTI result is missing matching/evidence fields");
  }

  console.log("VBTI SEGMENTED PIPELINE SMOKE: OK");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
