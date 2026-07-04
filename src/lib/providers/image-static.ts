import type { ImageProvider } from "@/types/core";
import { resolvePersonaImage } from "@/lib/personas/images";

/**
 * Static persona-image provider.
 *
 * VBTI's D2 decision (see PRD-VBTI-v1.1 §5.5) is that persona portraits are
 * pre-generated offline and shipped as static assets under public/personas/.
 * At request time we just look up the matched personaId — no image generation,
 * no API call, no latency budget spent here.
 *
 * The prompt argument is ignored on purpose. It's retained in the interface
 * for two reasons: it lets the mock/dev image generator still consume prompts,
 * and it leaves the door open for a v2 provider that fine-tunes per-user
 * portraits (rejected for v1, see §5.5 "Why static, not on-the-fly").
 */
export class StaticImageProvider implements ImageProvider {
  async generate(
    _prompt: string,
    opts?: { roleId?: string },
  ): Promise<{ url: string }> {
    // `roleId` is the legacy field name in the ImageProvider interface. In VBTI
    // it carries the matched personaId. The lookup treats them the same.
    const url = resolvePersonaImage(opts?.roleId);
    return { url };
  }
}
