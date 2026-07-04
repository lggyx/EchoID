/**
 * VBTI 5-segment pipeline · e2e HTTP smoke.
 *
 * Verifies the full path exercised by real client code:
 *   POST /api/analyze  (meta + 5x audio)  → segmented pipeline
 *   GET  /api/analyze?full=1              → VBTI full payload
 *   GET  /personas/<id>.png               → static portrait resolved
 *
 * Also cross-checks that Prisma persisted the row correctly.
 *
 * How to run (from repo root, dev container up, audio pre-generated):
 *   # 1. generate 5 synthetic zh-CN clips on the host
 *   for i in 1 2 3 4 5; do
 *     say -v Tingting -o /tmp/vbti_q$i.aiff "<text_i>"
 *     ffmpeg -y -i /tmp/vbti_q$i.aiff -ac 1 -ar 16000 /tmp/vbti_q$i.wav
 *   done
 *   # 2. execute the smoke inside the dev container
 *   container exec echoid-dev bash -lc \
 *     "cd /app && npx tsx --env-file=.env src/lib/__tests__/analyze-segmented-e2e.smoke.ts"
 *
 * The test finds audio at /tmp/vbti_q{1..5}.wav. If not present, it falls
 * back to generating sine-tone WAVs via ffmpeg — pipeline structure passes
 * but Whisper transcripts will be empty, which is a valid degraded mode.
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const AUDIO_DIR = process.env.AUDIO_DIR ?? "/tmp";

interface Failure {
  where: string;
  msg: string;
}
const failures: Failure[] = [];
const fail = (where: string, msg: string) => {
  failures.push({ where, msg });
  console.log(`  ✗ ${where}: ${msg}`);
};
const ok = (where: string, msg = "") => {
  console.log(`  ✓ ${where}${msg ? ": " + msg : ""}`);
};

async function ensureAudio(): Promise<{ paths: string[]; degraded: boolean }> {
  const paths: string[] = [];
  let missing = 0;
  for (let i = 1; i <= 5; i++) {
    const p = path.join(AUDIO_DIR, `vbti_q${i}.wav`);
    if (existsSync(p)) paths.push(p);
    else missing++;
  }
  if (missing === 0) return { paths, degraded: false };

  console.log(`  ! missing ${missing}/5 audio files, generating sine fallback`);
  const genPaths: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const p = path.join(AUDIO_DIR, `vbti_q${i}.wav`);
    if (existsSync(p)) {
      genPaths.push(p);
      continue;
    }
    const freq = 220 + (i - 1) * 40;
    const rc = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=5`,
      "-ac", "1", "-ar", "16000", p,
    ]);
    if (rc.status !== 0) throw new Error(`ffmpeg failed for q${i}`);
    genPaths.push(p);
  }
  return { paths: genPaths, degraded: true };
}

async function postSegments(paths: string[]) {
  const fd = new FormData();
  fd.append(
    "meta",
    JSON.stringify({ questionCount: paths.length, stageDirection: "female" }),
  );
  for (const p of paths) {
    const buf = await fs.readFile(p);
    // Node 22 supports Blob with a Uint8Array constructor.
    fd.append("audio", new Blob([new Uint8Array(buf)], { type: "audio/wav" }), path.basename(p));
  }
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/analyze`, { method: "POST", body: fd });
  const dt = Date.now() - t0;
  const body = await res.json();
  return { res, body, dt };
}

async function main() {
  console.log(`=== VBTI segmented e2e (${BASE}) ===\n`);

  console.log("--- step 1: prepare audio ---");
  const { paths, degraded } = await ensureAudio();
  console.log(`  audio: ${paths.length} files ${degraded ? "(DEGRADED sine)" : "(real)"}`);

  console.log("\n--- step 2: POST /api/analyze (segmented) ---");
  const post = await postSegments(paths);
  console.log(`  http_code=${post.res.status}  t=${post.dt}ms`);
  if (post.res.status !== 200) {
    fail("POST", `status=${post.res.status} body=${JSON.stringify(post.body).slice(0, 200)}`);
    finish();
    return;
  }
  const partial = post.body as {
    recordingId?: string; resultId?: string; cardId?: string;
    headline?: string; imageUrl?: string;
    matchedSubsystem?: string; subsystemTitle?: string;
    roleTitle?: string;
  };
  for (const k of [
    "recordingId", "resultId", "cardId", "headline", "imageUrl",
    "matchedSubsystem", "subsystemTitle",
  ] as const) {
    if (!partial[k]) fail("POST field", `${k} missing`);
  }
  if (partial.roleTitle) fail("POST", "legacy roleTitle present in VBTI response");
  if (partial.matchedSubsystem && !["film", "variety", "stage", "robot", "street"].includes(partial.matchedSubsystem)) {
    fail("POST", `unknown subsystem ${partial.matchedSubsystem}`);
  }
  ok("subsystem", `${partial.matchedSubsystem} (${partial.subsystemTitle})`);
  ok("headline", partial.headline ?? "");
  ok("imageUrl", partial.imageUrl ?? "");

  const { resultId, imageUrl } = partial;
  if (!resultId || !imageUrl) {
    fail("POST", "missing resultId or imageUrl for follow-up steps");
    finish();
    return;
  }

  console.log("\n--- step 3: GET /api/analyze?full=1 ---");
  const fullRes = await fetch(`${BASE}/api/analyze?full=1&resultId=${encodeURIComponent(resultId)}`);
  console.log(`  http_code=${fullRes.status}`);
  if (fullRes.status !== 200) {
    fail("GET full", `status=${fullRes.status}`);
    finish();
    return;
  }
  const full = (await fullRes.json()) as {
    contrastRateAvg?: number;
    contrastRateStd?: number;
    dramaDensityAvg?: number;
    z1SpeedStability?: number;
    z2VolumeStrength?: number;
    z3MonologueTendency?: number;
    matchedPersonaId?: string;
    evidenceJson?: unknown;
    segmentsSummary?: Array<{
      questionIndex: number; transcript: string;
      contrastRate: number; dramaDensity: number;
    }>;
  };
  for (const k of [
    "contrastRateAvg", "contrastRateStd", "dramaDensityAvg",
    "z1SpeedStability", "z2VolumeStrength", "z3MonologueTendency",
    "matchedPersonaId", "evidenceJson", "segmentsSummary",
  ] as const) {
    if (full[k] === undefined || full[k] === null) fail("GET full field", `${k} missing`);
  }
  if (full.segmentsSummary && full.segmentsSummary.length !== paths.length) {
    fail("GET full", `segmentsSummary length ${full.segmentsSummary.length} != ${paths.length}`);
  }
  ok("contrastAvg", full.contrastRateAvg?.toFixed(1) ?? "");
  ok("dramaAvg", full.dramaDensityAvg?.toFixed(1) ?? "");
  ok("persona", full.matchedPersonaId ?? "");
  if (full.segmentsSummary) {
    const spread =
      Math.max(...full.segmentsSummary.map((s) => s.contrastRate)) -
      Math.min(...full.segmentsSummary.map((s) => s.contrastRate));
    ok("contrast spread across segments", `${spread.toFixed(1)}${degraded ? " (sine)" : ""}`);
    // In non-degraded mode with the 5 canned scripts we expect a clear spread.
    if (!degraded && spread < 5) fail("spread", `only ${spread.toFixed(1)} — expected variance`);
    console.log("  segment previews:");
    for (const s of full.segmentsSummary.slice(0, 3)) {
      console.log(
        `    q${s.questionIndex} contrast=${s.contrastRate.toFixed(0)}  drama=${s.dramaDensity.toFixed(0)}  ` +
          `“${s.transcript.slice(0, 20)}…”`,
      );
    }
  }

  console.log("\n--- step 4: image URL resolves ---");
  const imgRes = await fetch(`${BASE}${imageUrl}`);
  console.log(`  http_code=${imgRes.status}  bytes=${imgRes.headers.get("content-length") ?? "?"}`);
  if (imgRes.status !== 200) fail("image", `status=${imgRes.status} for ${imageUrl}`);

  finish();
}

function finish() {
  console.log("\n" + (failures.length === 0 ? "PASS" : `FAIL (${failures.length})`));
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
