/**
 * Static persona image lookup — matches PRD-VBTI-v1.1 §5.5's decision D2:
 * "portraits are pre-generated offline, request path just looks them up".
 *
 * When a new persona is added, drop the PNG under `public/personas/vbti/`
 * (VBTI cards) or `public/personas/` (legacy EchoID cards) and add one
 * entry to the map below. Zero call-site changes anywhere else.
 */

/** URL relative to the Next.js public/ root. Served directly, no /api route. */
export type StaticImageUrl = `/personas/${string}` | `/personas/vbti/${string}`;

/**
 * VBTI persona portraits — 35 cards across 5 subsystems, produced offline
 * with gpt-image-2 and stored transparent under public/personas/vbti/. The
 * personaId is the filename base (`snake_case`, no NN_ prefix, no .png).
 *
 * Card pool structure (7 per subsystem = 35, matches PRD §5.5):
 *   01-07  film     影视组   group_extra, method_actor, villain_specialist,
 *                            stunt_double, oscar_best_actor, ng_king,
 *                            lifetime_achievement
 *   08-14  variety  综艺组   mic_grabber, standup_performer,
 *                            atmosphere_driver, quote_maker,
 *                            variety_bully, variety_ramblings,
 *                            finals_champion
 *   15-21  stage    舞台组   theater_voice, monologue_maniac, poet_reader,
 *                            backstage_curtain, veteran_actor,
 *                            forgotten_lines_ng_king, monologue_god
 *   22-28  robot    机器人组 ai_customer_2049, navigation_announcer,
 *                            weather_presenter, glitch_repeater,
 *                            screensaver_bgm, error_404_announcer,
 *                            turing_test_passed
 *   29-35  street   街头组   street_soul_singer, crosstalk_fan,
 *                            street_busker, plaza_dance_leader,
 *                            karaoke_king, low_volume_busker, street_king
 */
export const VBTI_PERSONA_IMAGE_MAP: Record<string, StaticImageUrl> = {
  // 影视组 film 01-07
  group_extra: "/personas/vbti/01_group_extra.png",
  method_actor: "/personas/vbti/02_method_actor.png",
  villain_specialist: "/personas/vbti/03_villain_specialist.png",
  stunt_double: "/personas/vbti/04_stunt_double.png",
  oscar_best_actor: "/personas/vbti/05_oscar_best_actor.png",
  ng_king: "/personas/vbti/06_ng_king.png",
  lifetime_achievement: "/personas/vbti/07_lifetime_achievement.png",

  // 综艺组 variety 08-14
  mic_grabber: "/personas/vbti/08_mic_grabber.png",
  standup_performer: "/personas/vbti/09_standup_performer.png",
  atmosphere_driver: "/personas/vbti/10_atmosphere_driver.png",
  quote_maker: "/personas/vbti/11_quote_maker.png",
  variety_bully: "/personas/vbti/12_variety_bully.png",
  variety_ramblings: "/personas/vbti/13_variety_ramblings.png",
  finals_champion: "/personas/vbti/14_finals_champion.png",

  // 舞台组 stage 15-21
  theater_voice: "/personas/vbti/15_theater_voice.png",
  monologue_maniac: "/personas/vbti/16_monologue_maniac.png",
  poet_reader: "/personas/vbti/17_poet_reader.png",
  backstage_curtain: "/personas/vbti/18_backstage_curtain.png",
  veteran_actor: "/personas/vbti/19_veteran_actor.png",
  forgotten_lines_ng_king: "/personas/vbti/20_forgotten_lines_ng_king.png",
  monologue_god: "/personas/vbti/21_monologue_god.png",

  // 机器人组 robot 22-28
  ai_customer_2049: "/personas/vbti/22_ai_customer_2049.png",
  navigation_announcer: "/personas/vbti/23_navigation_announcer.png",
  weather_presenter: "/personas/vbti/24_weather_presenter.png",
  glitch_repeater: "/personas/vbti/25_glitch_repeater.png",
  screensaver_bgm: "/personas/vbti/26_screensaver_bgm.png",
  error_404_announcer: "/personas/vbti/27_error_404_announcer.png",
  turing_test_passed: "/personas/vbti/28_turing_test_passed.png",

  // 街头组 street 29-35
  street_soul_singer: "/personas/vbti/29_street_soul_singer.png",
  crosstalk_fan: "/personas/vbti/30_crosstalk_fan.png",
  street_busker: "/personas/vbti/31_street_busker.png",
  plaza_dance_leader: "/personas/vbti/32_plaza_dance_leader.png",
  karaoke_king: "/personas/vbti/33_karaoke_king.png",
  low_volume_busker: "/personas/vbti/34_low_volume_busker.png",
  street_king: "/personas/vbti/35_street_king.png",
};

/**
 * Which subsystem a persona belongs to. Used by the placeholder matcher
 * (and by any future default-persona-per-subsystem UX) — the real subsystem
 * matcher in Track A returns its own answer, this is just a lookup helper.
 */
export const VBTI_SUBSYSTEM: Record<string, "film" | "variety" | "stage" | "robot" | "street"> = {
  group_extra: "film", method_actor: "film", villain_specialist: "film",
  stunt_double: "film", oscar_best_actor: "film", ng_king: "film",
  lifetime_achievement: "film",

  mic_grabber: "variety", standup_performer: "variety", atmosphere_driver: "variety",
  quote_maker: "variety", variety_bully: "variety", variety_ramblings: "variety",
  finals_champion: "variety",

  theater_voice: "stage", monologue_maniac: "stage", poet_reader: "stage",
  backstage_curtain: "stage", veteran_actor: "stage", forgotten_lines_ng_king: "stage",
  monologue_god: "stage",

  ai_customer_2049: "robot", navigation_announcer: "robot", weather_presenter: "robot",
  glitch_repeater: "robot", screensaver_bgm: "robot", error_404_announcer: "robot",
  turing_test_passed: "robot",

  street_soul_singer: "street", crosstalk_fan: "street", street_busker: "street",
  plaza_dance_leader: "street", karaoke_king: "street", low_volume_busker: "street",
  street_king: "street",
};

/**
 * Legacy EchoID roles — 12 low-poly portraits used by the pre-VBTI single-
 * segment pipeline. Kept so existing shared cards keep resolving.
 * Sourced from IP_CHARACTER_DESIGNS/echoid-lowpoly-final/.
 */
export const LEGACY_PERSONA_IMAGE_MAP: Record<string, StaticImageUrl> = {
  late_night_radio_host: "/personas/late_night_radio_host.png",
  rapid_lecturer: "/personas/rapid_lecturer.png",
  gentle_hollow: "/personas/gentle_hollow.png",
  neighbor_chatter: "/personas/neighbor_chatter.png",
  steady_decision_maker: "/personas/steady_decision_maker.png",
  poet_reader_legacy: "/personas/poet_reader.png", // aliased to avoid collision with VBTI's poet_reader
  standup_performer_legacy: "/personas/standup_performer.png", // aliased to avoid collision
  boardroom_speaker: "/personas/boardroom_speaker.png",
  curious_asker: "/personas/curious_asker.png",
  deep_philosopher: "/personas/deep_philosopher.png",
  cheerleader: "/personas/cheerleader.png",
  calm_narrator: "/personas/calm_narrator.png",
};

/**
 * Union map used by the resolver. VBTI IDs take precedence — the legacy
 * `poet_reader` / `standup_performer` names collided with VBTI cards of
 * the same intent but different art, so they've been renamed above.
 */
export const PERSONA_IMAGE_MAP: Record<string, StaticImageUrl> = {
  ...LEGACY_PERSONA_IMAGE_MAP,
  ...VBTI_PERSONA_IMAGE_MAP,
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

/** List all VBTI persona IDs (35), grouped by subsystem in visual order. */
export function listVbtiPersonas(): string[] {
  return Object.keys(VBTI_PERSONA_IMAGE_MAP);
}
