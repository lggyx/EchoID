// Filesystem helpers for EchoID storage.
// Layout under STORAGE_DIR (default ./storage):
//   audio/   raw uploaded recordings (TTL-expired)
//   cards/   final composite card images (Agent-4)
//   images/  generated poster images (mock/real image provider)

import { promises as fs } from "node:fs";
import path from "node:path";

/** Resolved absolute path to the storage root. */
export const storageDir = path.resolve(
  process.cwd(),
  process.env.STORAGE_DIR ?? "./storage",
);

/** Subdirectories we ever serve/read. Anything else is off-limits. */
export const ALLOWED_SUBDIRS = ["audio", "cards", "images"] as const;
export type AllowedSubdir = (typeof ALLOWED_SUBDIRS)[number];

/** Audio retention in hours (defaults to 24). */
export function getAudioTtlHours(): number {
  const raw = process.env.AUDIO_TTL_HOURS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 24;
}

/** Ensure the standard subdirectory tree exists. Idempotent. */
export async function ensureStorageTree(): Promise<void> {
  await fs.mkdir(storageDir, { recursive: true });
  await Promise.all(
    ALLOWED_SUBDIRS.map((sub) => fs.mkdir(path.join(storageDir, sub), { recursive: true })),
  );
}

/** Mime → file extension. Falls back to `bin`. */
export function mimeToExt(mimeType: string): string {
  const m = mimeType.toLowerCase().split(";")[0].trim();
  switch (m) {
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave":
      return "wav";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/ogg":
    case "application/ogg":
      return "ogg";
    case "audio/webm":
      return "webm";
    case "audio/flac":
      return "flac";
    default:
      return "bin";
  }
}

/** Extension → content-type for /api/storage serving. */
export function extToContentType(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  switch (e) {
    case "wav": return "audio/wav";
    case "mp3": return "audio/mpeg";
    case "m4a": return "audio/mp4";
    case "aac": return "audio/aac";
    case "ogg": return "audio/ogg";
    case "webm": return "audio/webm";
    case "flac": return "audio/flac";
    case "svg": return "image/svg+xml";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "json": return "application/json";
    default: return "application/octet-stream";
  }
}

/**
 * Save an uploaded audio blob to `audio/<id>.<ext>` and return the absolute
 * path plus the URL-shaped relative path (`/storage/audio/<id>.<ext>`).
 */
export async function saveUploadedAudio(opts: {
  id: string;
  mimeType: string;
  data: Buffer | Uint8Array;
}): Promise<{ absPath: string; relPath: string; ext: string }> {
  await ensureStorageTree();
  const ext = mimeToExt(opts.mimeType);
  const filename = `${opts.id}.${ext}`;
  const absPath = path.join(storageDir, "audio", filename);
  await fs.writeFile(absPath, opts.data);
  return { absPath, relPath: `/storage/audio/${filename}`, ext };
}

/**
 * Write a card composite file to `cards/<id>.<ext>`. Agent-4 uses this once
 * it has rendered the poster + QR into a single image.
 */
export async function saveCardFile(opts: {
  id: string;
  ext: string;
  data: Buffer | Uint8Array | string;
}): Promise<{ absPath: string; relPath: string }> {
  await ensureStorageTree();
  const filename = `${opts.id}.${opts.ext.replace(/^\./, "")}`;
  const absPath = path.join(storageDir, "cards", filename);
  await fs.writeFile(absPath, opts.data as any);
  return { absPath, relPath: `/storage/cards/${filename}` };
}

/**
 * Resolve a `/storage/<sub>/<file>` request path to an absolute path on disk,
 * rejecting anything that escapes the storage root or targets a non-allowed
 * subdir. Returns null when the request is invalid.
 */
export function resolveStorageRequestPath(segments: string[]): string | null {
  if (!segments.length) return null;
  const [sub, ...rest] = segments;
  if (!(ALLOWED_SUBDIRS as readonly string[]).includes(sub)) return null;
  // Reject `..` and empty parts eagerly.
  if (rest.some((s) => !s || s === "." || s === ".." || s.includes("\0"))) return null;
  const target = path.resolve(storageDir, sub, ...rest);
  const root = path.resolve(storageDir);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  // Ensure we're still within the correct sub.
  const subRoot = path.resolve(storageDir, sub);
  if (target !== subRoot && !target.startsWith(subRoot + path.sep)) return null;
  return target;
}

/**
 * Delete audio files whose mtime is older than the TTL. Cheap MVP GC:
 * we don't consult the DB, we just prune the folder. Returns file count deleted.
 */
export async function cleanupExpiredAudio(now: Date = new Date()): Promise<number> {
  await ensureStorageTree();
  const dir = path.join(storageDir, "audio");
  const ttlMs = getAudioTtlHours() * 3600 * 1000;
  const cutoff = now.getTime() - ttlMs;
  const entries = await fs.readdir(dir);
  let removed = 0;
  await Promise.all(
    entries.map(async (name) => {
      const p = path.join(dir, name);
      try {
        const stat = await fs.stat(p);
        if (!stat.isFile()) return;
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(p);
          removed++;
        }
      } catch {
        // ignore transient stat/unlink races
      }
    }),
  );
  return removed;
}
