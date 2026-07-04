import { PERSONAS } from "./personas";

export type StaticImageUrl = `/personas/${string}` | `/personas/vbti/${string}`;

export const FALLBACK_PERSONA_IMAGE: StaticImageUrl = "/personas/_fallback.svg";

export const LEGACY_PERSONA_IMAGE_MAP: Record<string, StaticImageUrl> = {
  late_night_radio_host: "/personas/late_night_radio_host.png",
  rapid_lecturer: "/personas/rapid_lecturer.png",
  gentle_hollow: "/personas/gentle_hollow.png",
  neighbor_chatter: "/personas/neighbor_chatter.png",
  steady_decision_maker: "/personas/steady_decision_maker.png",
  poet_reader_legacy: "/personas/poet_reader.png",
  standup_performer_legacy: "/personas/standup_performer.png",
  boardroom_speaker: "/personas/boardroom_speaker.png",
  curious_asker: "/personas/curious_asker.png",
  deep_philosopher: "/personas/deep_philosopher.png",
  cheerleader: "/personas/cheerleader.png",
  calm_narrator: "/personas/calm_narrator.png",
};

export const VBTI_PERSONA_IMAGE_MAP: Record<string, StaticImageUrl> = Object.fromEntries(
  PERSONAS.map((persona) => [persona.id, persona.image.src as StaticImageUrl]),
) as Record<string, StaticImageUrl>;

export const PERSONA_IMAGE_MAP: Record<string, StaticImageUrl> = {
  ...LEGACY_PERSONA_IMAGE_MAP,
  ...VBTI_PERSONA_IMAGE_MAP,
};

export function resolvePersonaImage(id: string | undefined): StaticImageUrl {
  if (!id) return FALLBACK_PERSONA_IMAGE;
  return PERSONA_IMAGE_MAP[id] ?? FALLBACK_PERSONA_IMAGE;
}

export function hasPersonaImage(id: string | undefined): boolean {
  return !!(id && PERSONA_IMAGE_MAP[id]);
}

export function listVbtiPersonas(): string[] {
  return Object.keys(VBTI_PERSONA_IMAGE_MAP);
}
