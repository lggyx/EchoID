/**
 * Smoke test for the static ImageProvider.
 *
 * Verifies:
 *   1. Every ID in PERSONA_IMAGE_MAP resolves to an existing file under
 *      public/personas/.
 *   2. Unknown IDs get the fallback.
 *   3. The StaticImageProvider selected by the factory returns the same URLs.
 *
 * Run:
 *   container exec echoid-dev bash -lc \
 *     "cd /app && npx tsx --env-file=.env src/lib/providers/__tests__/image-static.smoke.ts"
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { getImageProvider } from "@/lib/providers";
import {
  FALLBACK_PERSONA_IMAGE,
  PERSONA_IMAGE_MAP,
  hasPersonaImage,
  resolvePersonaImage,
} from "@/lib/personas/images";

async function assertFile(relUrl: string): Promise<{ ok: boolean; size?: number; err?: string }> {
  const abs = path.join(process.cwd(), "public", relUrl.replace(/^\//, ""));
  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return { ok: false, err: "not a file" };
    return { ok: true, size: st.size };
  } catch (e) {
    return { ok: false, err: (e as Error).message };
  }
}

async function checkMap() {
  console.log("=== persona image map ===");
  let fail = 0;
  for (const [id, url] of Object.entries(PERSONA_IMAGE_MAP)) {
    const r = await assertFile(url);
    const tag = r.ok ? "OK" : "FAIL";
    if (!r.ok) fail += 1;
    console.log(
      `  [${tag}] ${id.padEnd(24)} → ${url}  ${
        r.ok ? `(${(r.size! / 1024).toFixed(0)} KB)` : `err=${r.err}`
      }`,
    );
  }
  // Fallback also must exist.
  const fb = await assertFile(FALLBACK_PERSONA_IMAGE);
  console.log(
    `  [${fb.ok ? "OK" : "FAIL"}] ${"_fallback".padEnd(24)} → ${FALLBACK_PERSONA_IMAGE}  ${
      fb.ok ? `(${(fb.size! / 1024).toFixed(1)} KB)` : `err=${fb.err}`
    }`,
  );
  if (!fb.ok) fail += 1;
  return fail;
}

async function checkResolver() {
  console.log("\n=== resolver ===");
  const cases: [string | undefined, string, boolean][] = [
    ["late_night_radio_host", "/personas/late_night_radio_host.png", true],
    ["cheerleader", "/personas/cheerleader.png", true],
    ["nonexistent_id", FALLBACK_PERSONA_IMAGE, false],
    [undefined, FALLBACK_PERSONA_IMAGE, false],
  ];
  let fail = 0;
  for (const [id, want, wantHas] of cases) {
    const got = resolvePersonaImage(id);
    const has = hasPersonaImage(id);
    const okUrl = got === want;
    const okHas = has === wantHas;
    const tag = okUrl && okHas ? "OK" : "FAIL";
    if (!okUrl || !okHas) fail += 1;
    console.log(
      `  [${tag}] id=${String(id).padEnd(24)} url=${got}  has=${has} (want=${want} has=${wantHas})`,
    );
  }
  return fail;
}

async function checkFactory() {
  console.log("\n=== factory ===");
  const p = getImageProvider();
  console.log(`  picked: ${p.constructor.name}`);
  const gen1 = await p.generate("ignored prompt", { roleId: "poet_reader" });
  const gen2 = await p.generate("ignored prompt", { roleId: "totally_unknown" });
  const gen3 = await p.generate("ignored prompt"); // no roleId
  console.log(`  poet_reader     → ${gen1.url}`);
  console.log(`  unknown         → ${gen2.url}`);
  console.log(`  no roleId       → ${gen3.url}`);
  let fail = 0;
  if (p.constructor.name !== "StaticImageProvider") {
    console.log("  ! factory did not pick StaticImageProvider (check IMAGE_PROVIDER env)");
    fail += 1;
  }
  if (gen1.url !== "/personas/poet_reader.png") fail += 1;
  if (gen2.url !== FALLBACK_PERSONA_IMAGE) fail += 1;
  if (gen3.url !== FALLBACK_PERSONA_IMAGE) fail += 1;
  return fail;
}

async function main() {
  const failures = (await checkMap()) + (await checkResolver()) + (await checkFactory());
  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures} check(s))`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
