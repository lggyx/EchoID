import type {
  AcousticFeatures,
  MatchResult,
  Persona,
  PersonaReason,
  PersonaRule,
  VbtiSubsystem,
  VbtiVector,
} from "@/types/core";
import { PERSONAS } from "@/lib/personas/personas";
import { manhattanDistance, matchSubsystem } from "./subsystem";

export interface MatchVbtiInput {
  vector: VbtiVector;
  features?: AcousticFeatures;
  personas?: Persona[];
}

export interface MatchPersonaInput extends MatchVbtiInput {
  subsystem: VbtiSubsystem;
}

export function matchVbti(input: MatchVbtiInput): MatchResult {
  const personas = input.personas ?? PERSONAS;
  const subsystem = matchSubsystem({ vector: input.vector, features: input.features });
  const persona = matchPersona({
    vector: input.vector,
    features: input.features,
    personas,
    subsystem: subsystem.matchedSubsystem,
  });

  return {
    matchedSubsystem: subsystem.matchedSubsystem,
    subsystemScores: subsystem.subsystemScores,
    subsystemDistances: subsystem.subsystemDistances,
    triggered: subsystem.triggered,
    ...persona,
  };
}

export function matchPersona(input: MatchPersonaInput): Omit<
  MatchResult,
  "matchedSubsystem" | "subsystemScores" | "subsystemDistances" | "triggered"
> {
  const personas = (input.personas ?? PERSONAS).filter((persona) => persona.subsystem === input.subsystem);
  if (personas.length === 0) {
    throw new Error(`matchPersona: no personas for subsystem ${input.subsystem}`);
  }

  const rare = firstRuleMatch(personas, input.vector, "rare");
  if (rare) return buildResult(rare, personas, "rare_rule", input.vector);

  const fallback = firstRuleMatch(personas, input.vector, "fallback");
  if (fallback) return buildResult(fallback, personas, "fallback_rule", input.vector);

  const regulars = personas.filter((persona) => persona.kind === "regular" && persona.center);
  const nearest = regulars
    .map((persona) => ({
      persona,
      distance: manhattanDistance(input.vector, persona.center!),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearest) {
    return buildResult(personas[0], personas, "nearest_neighbor", input.vector);
  }
  return buildResult(nearest.persona, personas, "nearest_neighbor", input.vector, nearest.distance);
}

function firstRuleMatch(
  personas: Persona[],
  vector: VbtiVector,
  kind: "rare" | "fallback",
): Persona | undefined {
  return personas
    .filter((persona) => persona.kind === kind && persona.rules?.some((rule) => ruleMatches(rule, vector)))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
}

function ruleMatches(rule: PersonaRule, vector: VbtiVector): boolean {
  for (const [key, range] of Object.entries(rule.when) as Array<[keyof VbtiVector, { min?: number; max?: number }]>) {
    const value = vector[key];
    if (range.min !== undefined && value < range.min) return false;
    if (range.max !== undefined && value > range.max) return false;
  }
  return true;
}

function buildResult(
  persona: Persona,
  pool: Persona[],
  personaReason: PersonaReason,
  vector: VbtiVector,
  distance?: number,
): Omit<MatchResult, "matchedSubsystem" | "subsystemScores" | "subsystemDistances" | "triggered"> {
  const sameSubsystem = pool.filter((candidate) => candidate.subsystem === persona.subsystem);
  const index = sameSubsystem.findIndex((candidate) => candidate.id === persona.id);
  return {
    matchedPersonaId: persona.id,
    persona,
    personaReason,
    personaDistance: distance ?? (persona.center ? manhattanDistance(vector, persona.center) : undefined),
    poolPosition: {
      index: index < 0 ? 1 : index + 1,
      total: sameSubsystem.length,
    },
  };
}
