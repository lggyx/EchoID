/**
 * Static persona image lookup — matches PRD-VBTI-v1.1 §5.5's decision D2:
 * "portraits are pre-generated offline, request path just looks them up".
 *
 * The map lives in code (not the filesystem) so we can reason about which
 * personaIds have art and which don't; unknown ids get the fallback image.
 *
 * When VBTI's `personas.ts` lands (track A), only this file needs updating —
 * add new `<personaId>: "/personas/<file>.png"` entries. Zero call-site
 * changes anywhere else in the app.
 */

/** URL relative to the Next.js public/ root. Served directly, no /api route. */
export type StaticImageUrl = `/personas/${string}.png` | `/personas/${string}.svg`;

/**
 * Sourced from IP_CHARACTER_DESIGNS/echoid-lowpoly-final/ (12 stylized 3D
 * low-poly portraits committed to the repo at that path). Copies live under
 * public/personas/ so Next.js serves them statically.
 *
 * These IDs are the legacy EchoID role IDs; when VBTI personas replace them,
 * remap here rather than in the ImageProvider.
 */
export const PERSONA_IMAGE_MAP: Record<string, StaticImageUrl> = {
  late_night_radio_host: "/personas/late_night_radio_host.png",
  rapid_lecturer: "/personas/rapid_lecturer.png",
  gentle_hollow: "/personas/gentle_hollow.png",
  neighbor_chatter: "/personas/neighbor_chatter.png",
  steady_decision_maker: "/personas/steady_decision_maker.png",
  poet_reader: "/personas/poet_reader.png",
  standup_performer: "/personas/standup_performer.png",
  boardroom_speaker: "/personas/boardroom_speaker.png",
  curious_asker: "/personas/curious_asker.png",
  deep_philosopher: "/personas/deep_philosopher.png",
  cheerleader: "/personas/cheerleader.png",
  calm_narrator: "/personas/calm_narrator.png",
};

/**
 * Fallback used when the matched persona has no static portrait yet — e.g.
 * a freshly added VBTI persona whose art hasn't been generated. Points at
 * a neutral placeholder we ship in the repo; UI treats it as a valid image.
 */
export const FALLBACK_PERSONA_IMAGE: StaticImageUrl = "/personas/_fallback.svg";

/**
 * Resolve a personaId (or roleId in the legacy path) to its static image URL.
 * Never throws — unknown ids get the fallback.
 */
export function resolvePersonaImage(id: string | undefined): StaticImageUrl {
  if (!id) return FALLBACK_PERSONA_IMAGE;
  return PERSONA_IMAGE_MAP[id] ?? FALLBACK_PERSONA_IMAGE;
}

/** Whether the id has real portrait art (not the fallback). */
export function hasPersonaImage(id: string | undefined): boolean {
  return !!(id && PERSONA_IMAGE_MAP[id]);
}
