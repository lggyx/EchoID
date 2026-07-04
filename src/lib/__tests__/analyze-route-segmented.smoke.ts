// Smoke test for POST /api/analyze segmented multipart routing.
// Run:
//   container exec echoid-dev bash -lc \
//     "cd /app && npx tsx --env-file=.env src/lib/__tests__/analyze-route-segmented.smoke.ts"

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WaveFile } from "wavefile";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/analyze/route";
import { prisma } from "@/lib/prisma";

process.env.ASR_PROVIDER = "mock";
process.env.LLM_API_KEY = "";
process.env.IMAGE_PROVIDER = "mock";

const SR = 16_000;

function writeSine(file: string, freq: number): void {
  const samples = new Int16Array(SR);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / SR) * 10_000);
  }
  const wav = new WaveFile();
  wav.fromScratch(1, SR, "16", samples);
  writeFileSync(file, Buffer.from(wav.toBuffer()));
}

async function main(): Promise<void> {
  const fd = new FormData();
  fd.append("meta", JSON.stringify({ questionCount: 5, stageDirection: "male" }));
  for (let i = 0; i < 5; i++) {
    const file = `/tmp/vbti_route_${i + 1}.wav`;
    writeSine(file, 220 + i * 30);
    fd.append("audio", new Blob([new Uint8Array(readFileSync(file))], { type: "audio/wav" }), path.basename(file));
  }

  const req = new NextRequest("http://localhost/api/analyze", {
    method: "POST",
    body: fd,
  });
  const res = await POST(req);
  const body = await res.json();
  if (res.status !== 200) throw new Error(`status ${res.status}: ${JSON.stringify(body)}`);
  if (!body.matchedSubsystem || !body.subsystemTitle) {
    throw new Error(`segmented response missing subsystem fields: ${JSON.stringify(body)}`);
  }
  if (body.roleTitle) throw new Error(`segmented response should not expose legacy roleTitle: ${JSON.stringify(body)}`);
  const count = await prisma.recordingSegment.count({ where: { recordingId: body.recordingId } });
  if (count !== 5) throw new Error(`expected 5 recording segments, got ${count}`);

  console.log("ANALYZE ROUTE SEGMENTED SMOKE: OK");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
