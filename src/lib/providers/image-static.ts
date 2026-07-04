import type { ImageProvider } from "@/types/core";
import { resolvePersonaImage } from "@/lib/personas/images";

export class StaticImageProvider implements ImageProvider {
  async generate(_prompt: string, opts?: { roleId?: string }): Promise<{ url: string }> {
    return { url: resolvePersonaImage(opts?.roleId) };
  }
}
