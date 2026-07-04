// Shared type contracts for EchoID.
// All subsystems (feature extraction, scoring, role matching, providers, UI)
// must conform to these types. This is the single source of truth.

// ============ Acoustic Features ============

/** Raw acoustic features extracted from the audio signal. */
export interface AcousticFeatures {
  /** Total audio duration in seconds. */
  duration: number;
  /** Speech rate in Chinese characters per second (typical 4-6). */
  speechRate: number;
  /** Standard deviation of segment-level speech rate. */
  speechRateVar: number;
  /** Number of silent pauses detected. */
  pauseCount: number;
  /** Average pause duration in seconds. */
  pauseDurAvg: number;
  /** Total silence duration / total duration. */
  pauseRatio: number;
  /** Mean F0 (pitch) in Hz over voiced frames. */
  f0Mean: number;
  /** Standard deviation of F0 over voiced frames. */
  f0Std: number;
  /** F0 range = max - min over voiced frames. */
  f0Range: number;
  /** Mean RMS energy (0..1 scale). */
  rmsMean: number;
  /** RMS dynamic range = max - min. */
  rmsDr: number;
  /** Slope of F0 at sentence endings; positive = rising (question), negative = falling (statement). */
  pitchSlopeEnd: number;
  /** Filler-word frequency per minute (e.g., "嗯/啊/呃/那个/就是/然后"). */
  fillerRate: number;
  /** Type-token ratio of transcript. */
  ttr: number;
  /** Average sentence length in characters. */
  sentLen: number;
  /** VBTI: debounced F0/RMS local extrema per second. */
  peakDensity: number;
  /** VBTI: pause-interval regularity in [0,1]. */
  pauseRegularity: number;
  /** VBTI: count of rapid speech-stop-speech transitions. */
  burstStops: number;
}

// ============ Six Dimensions ============

export const DIMENSION_KEYS = [
  "thinking_tempo",
  "emotional_expressiveness",
  "presence",
  "decision_style",
  "communication_style",
  "thinking_depth",
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export interface Dimension {
  key: DimensionKey;
  /** 0..100 score. */
  score: number;
  /** Human-readable level label, e.g., "急风骤雨" / "慢火细熬". */
  levelLabel: string;
  /** One-line interpretation for this dimension. */
  oneLiner: string;
  /** Concrete evidence metric like "语速 4.2 字/秒". */
  evidenceMetric: string;
}

// ============ Role Library ============

export interface RoleTemplate {
  id: string;
  title: string;
  persona: string;
  /** Center vector in the six-dimension space (each 0..100). */
  center: Record<DimensionKey, number>;
  /** Base image prompt template for gpt-image-2. */
  imagePromptTemplate: string;
  /** Primary theme color (hex). */
  themeColor: string;
}

// ============ VBTI Algorithm Contracts ============

export type VbtiSubsystem = "film" | "variety" | "stage" | "robot" | "street";

export interface VbtiVector {
  /** x-axis: contrast rate in [0,100]. */
  contrast: number;
  /** y-axis: drama density in [0,100]. */
  drama: number;
  /** Speech-rate stability in [0,100]. */
  z1: number;
  /** Volume strength in [0,100]. */
  z2: number;
  /** Monologue tendency in [0,100]. */
  z3: number;
}

export interface EvidenceItem {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  segmentIndex?: number;
  text: string;
}

export interface TriggeredSignal {
  id: string;
  label: string;
  subsystem?: VbtiSubsystem;
  personaId?: string;
  bonus?: number;
  evidence: EvidenceItem[];
}

export interface ContrastResult extends VbtiVector {
  contrastRateAvg: number;
  contrastRateStd: number;
  dramaDensityAvg: number;
  dramaDensityStd: number;
  semanticArousal: number;
  acousticArousal: number;
  triggered: TriggeredSignal[];
  evidence: EvidenceItem[];
}

export type PersonaKind = "regular" | "rare" | "fallback";

export interface PersonaRule {
  id: string;
  label: string;
  when: Partial<Record<keyof VbtiVector, { min?: number; max?: number }>>;
}

export interface Persona {
  id: string;
  subsystem: VbtiSubsystem;
  kind: PersonaKind;
  title: string;
  subtitle?: string;
  center?: VbtiVector;
  rules?: PersonaRule[];
  priority?: number;
  cardCopy: string;
  shareText?: string;
  image: {
    src: string;
    themeColor: string;
    promptTemplate?: string;
  };
}

export type PersonaReason = "rare_rule" | "fallback_rule" | "nearest_neighbor";

export interface MatchResult {
  matchedSubsystem: VbtiSubsystem;
  subsystemScores: Record<VbtiSubsystem, number>;
  subsystemDistances: Record<VbtiSubsystem, number>;
  matchedPersonaId: string;
  persona: Persona;
  personaReason: PersonaReason;
  personaDistance?: number;
  triggered: TriggeredSignal[];
  poolPosition: { index: number; total: number };
}

// ============ Analysis Pipeline Output ============

export interface AnalysisProfile {
  matchedRoleId: string;
  roleTitle: string;
  headline: string;
  dimensions: Dimension[];
  cardCopy: string;
  imagePrompt: string;
}

// ============ Provider Interfaces ============

export interface ASRResult {
  text: string;
  /** Word-level timestamps. `start`/`end` in seconds. */
  words: { text: string; start: number; end: number }[];
}

export interface ASRProvider {
  transcribe(audio: { path: string; mimeType: string }): Promise<ASRResult>;
}

export interface LLMProfileInput {
  features: AcousticFeatures;
  dimensions: Dimension[];
  matchedRole: RoleTemplate;
  transcript: string;
}

/**
 * Input for the VBTI arousal extractor: a short segment of ASR-transcribed
 * Chinese speech. `context` is optional metadata the LLM can use to bias its
 * interpretation (e.g., "this was a break-down rant about a TV show").
 */
export interface LLMArousalInput {
  transcript: string;
  context?: string;
}

/**
 * Semantic-arousal reading of a text segment. `arousal` is on a 0..1 scale
 * where 0 = utterly flat/detached and 1 = extremely worked up. `reason` is a
 * short human-readable justification we can surface as evidence.
 */
export interface ArousalResult {
  arousal: number;
  reason: string;
}

export interface LLMProvider {
  generateProfile(input: LLMProfileInput): Promise<AnalysisProfile>;
  /**
   * Extract semantic emotional arousal (激动度) from a Chinese text segment.
   * Used by VBTI to compute the contrast between what the user *said* and how
   * they *sounded* (voice arousal from DSP).
   *
   * Implementations SHOULD:
   *  - return `arousal` clamped to [0, 1]
   *  - never throw on transient network / schema failures — callers rely on
   *    the pipeline continuing; wrap in try/catch and fall back to a
   *    keyword-based estimate.
   */
  extractArousal(input: LLMArousalInput): Promise<ArousalResult>;
}

export interface ImageProvider {
  generate(prompt: string, opts?: { roleId?: string }): Promise<{ url: string }>;
}

// ============ Public Result Payloads ============

export interface AnalyzePartialResponse {
  recordingId: string;
  resultId: string;
  roleTitle: string;
  headline: string;
  imageUrl: string;
}

export interface AnalyzeFullResponse extends AnalyzePartialResponse {
  cardId: string;
  dimensions: Dimension[];
  features: AcousticFeatures;
  cardCopy: string;
}

// ============ VBTI Segmented Analyze Contract ============

export type StageDirection = "male" | "female" | "random";

export interface AnalyzeSegmentedMeta {
  questionCount: number;
  stageDirection?: StageDirection;
}

export interface AnalyzeSegmentedPartialResponse {
  recordingId: string;
  resultId: string;
  cardId: string;
  headline: string;
  imageUrl: string;
  matchedSubsystem?: VbtiSubsystem;
  subsystemTitle?: string;
  roleTitle?: string;
}

export interface AnalyzeSegmentedFullResponse extends AnalyzeSegmentedPartialResponse {
  cardCopy: string;
  contrastRateAvg: number;
  contrastRateStd: number;
  dramaDensityAvg: number;
  z1SpeedStability: number;
  z2VolumeStrength: number;
  z3MonologueTendency: number;
  matchedPersonaId: string;
  evidenceJson: unknown;
  segmentsSummary: Array<{
    questionIndex: number;
    transcript: string;
    contrastRate: number;
    dramaDensity: number;
  }>;
}
