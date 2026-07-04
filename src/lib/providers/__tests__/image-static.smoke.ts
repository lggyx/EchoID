// Smoke test for static persona image provider.
// Run:
//   container exec echoid-dev bash -lc \
//     "cd /app && npx tsx --env-file=.env src/lib/providers/__tests__/image-static.smoke.ts"

import { promises as fs } from "node:fs";
import path from "node:path";
import { getImageProvider } from "@/lib/providers";
import { FALLBACK_PERSONA_IMAGE, resolvePersonaImage } from "@/lib/personas/images";

async function existsPublic(url: string): Promise<boolean> {
  const abs = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  try {
    const stat = await fs.stat(abs);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  process.env.IMAGE_PROVIDER = "static";
  const method = resolvePersonaImage("method_actor");
  const unknown = resolvePersonaImage("not_a_persona");
  if (method !== "/personas/vbti/02_method_actor.png") {
    throw new Error(`method_actor resolved to ${method}`);
  }
  if (unknown !== FALLBACK_PERSONA_IMAGE) {
    throw new Error(`unknown should resolve to fallback, got ${unknown}`);
  }
  for (const url of [method, unknown]) {
    if (!(await existsPublic(url))) throw new Error(`missing public asset ${url}`);
  }
  const provider = getImageProvider();
  const img = await provider.generate("ignored", { roleId: "method_actor" });
  if (img.url !== method) throw new Error(`provider returned ${img.url}`);

  console.log("STATIC IMAGE PROVIDER SMOKE: OK");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
