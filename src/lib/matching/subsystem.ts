import type { AcousticFeatures, TriggeredSignal, VbtiSubsystem, VbtiVector } from "@/types/core";
import {
  SIGNATURE_BONUS,
  SIGNATURE_TRIGGERS,
  SUBSYSTEM_CENTERS,
  SUBSYSTEM_KEYS,
  triggerToSignal,
} from "./config";

export interface SubsystemMatchInput {
  vector: VbtiVector;
  features?: AcousticFeatures;
}

export interface SubsystemMatchResult {
  matchedSubsystem: VbtiSubsystem;
  subsystemScores: Record<VbtiSubsystem, number>;
  subsystemDistances: Record<VbtiSubsystem, number>;
  triggered: TriggeredSignal[];
}

export function matchSubsystem(input: SubsystemMatchInput): SubsystemMatchResult {
  const triggered = SIGNATURE_TRIGGERS
    .filter((trigger) => trigger.matches(input))
    .map((trigger) => triggerToSignal(trigger, input));

  const subsystemDistances = {} as Record<VbtiSubsystem, number>;
  const subsystemScores = {} as Record<VbtiSubsystem, number>;
  for (const subsystem of SUBSYSTEM_KEYS) {
    const distance = manhattanDistance(input.vector, SUBSYSTEM_CENTERS[subsystem]) / 500;
    const bonus = triggered.some((signal) => signal.subsystem === subsystem) ? SIGNATURE_BONUS : 0;
    subsystemDistances[subsystem] = distance;
    subsystemScores[subsystem] = 1 - distance + bonus;
  }

  let matchedSubsystem = SUBSYSTEM_KEYS[0];
  for (const subsystem of SUBSYSTEM_KEYS.slice(1)) {
    if (subsystemScores[subsystem] > subsystemScores[matchedSubsystem]) {
      matchedSubsystem = subsystem;
    }
  }

  return { matchedSubsystem, subsystemScores, subsystemDistances, triggered };
}

export function manhattanDistance(a: VbtiVector, b: VbtiVector): number {
  return (
    Math.abs(a.contrast - b.contrast) +
    Math.abs(a.drama - b.drama) +
    Math.abs(a.z1 - b.z1) +
    Math.abs(a.z2 - b.z2) +
    Math.abs(a.z3 - b.z3)
  );
}
