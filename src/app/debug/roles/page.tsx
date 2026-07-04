import { promises as fs } from "node:fs";
import path from "node:path";
import { MockImageProvider } from "@/lib/providers/image-mock";
import { ROLE_LIBRARY } from "@/lib/roles/library";
import { storageDir } from "@/lib/providers";

// Debug-only visual gallery of all 12 role posters — makes it easy to
// eyeball the MBTI-style illustrations without going through the full
// record → analyze → result flow for each one.
//
// Only enabled in development.

export const dynamic = "force-dynamic";

async function ensureAll(): Promise<{ id: string; title: string; url: string }[]> {
  const provider = new MockImageProvider(storageDir);
  const out: { id: string; title: string; url: string }[] = [];
  for (const role of ROLE_LIBRARY) {
    // Reuse if we already have a preview file for this role; otherwise mint one.
    const dir = path.join(storageDir, "images");
    await fs.mkdir(dir, { recursive: true });
    const previewName = `preview__${role.id}.svg`;
    const previewPath = path.join(dir, previewName);
    try {
      await fs.stat(previewPath);
      out.push({ id: role.id, title: role.title, url: `/api/storage/images/${previewName}` });
      continue;
    } catch {
      /* fall through to generate */
    }
    // Generate via the provider, then rename to the stable preview name.
    const gen = await provider.generate("preview", { roleId: role.id });
    const genPath = path.join(storageDir, gen.url.replace(/^\/api\/storage\//, ""));
    await fs.rename(genPath, previewPath);
    out.push({ id: role.id, title: role.title, url: `/api/storage/images/${previewName}` });
  }
  return out;
}

export default async function RolePreviewPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="min-h-screen p-6 text-sm text-ink/60">
        preview page disabled in production
      </main>
    );
  }
  const items = await ensureAll();
  return (
    <main className="min-h-screen bg-canvas text-ink px-4 py-8">
      <div className="max-w-[1080px] mx-auto">
        <header className="mb-6">
          <h1 className="font-display font-medium text-2xl">
            Role Posters — MBTI Style
          </h1>
          <p className="text-xs text-subtle font-mono mt-1">
            {items.length} roles · /api/storage/images/preview__[id].svg (delete
            files under storage/images/preview__*.svg to regenerate)
          </p>
        </header>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {items.map((it) => (
            <figure
              key={it.id}
              className="rounded-2xl overflow-hidden grad-border bg-surface/60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt={it.title} className="w-full h-auto block" />
              <figcaption className="px-3 py-2 text-xs">
                <div className="font-medium text-ink">{it.title}</div>
                <div className="text-subtle font-mono">{it.id}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </main>
  );
}
