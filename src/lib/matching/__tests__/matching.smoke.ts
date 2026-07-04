// Smoke test for VBTI subsystem + persona matching.
// Run: npx tsx src/lib/matching/__tests__/matching.smoke.ts

import type { VbtiSubsystem, VbtiVector } from "@/types/core";
import { matchSubsystem } from "@/lib/matching/subsystem";
import { matchVbti } from "@/lib/matching/persona";
import { PERSONAS } from "@/lib/personas/personas";

const centers: Record<VbtiSubsystem, VbtiVector> = {
  film: { contrast: 75, drama: 55, z1: 60, z2: 55, z3: 50 },
  variety: { contrast: 55, drama: 90, z1: 20, z2: 65, z3: 30 },
  stage: { contrast: 25, drama: 80, z1: 90, z2: 65, z3: 95 },
  robot: { contrast: 40, drama: 10, z1: 90, z2: 50, z3: 50 },
  street: { contrast: 20, drama: 95, z1: 25, z2: 95, z3: 20 },
};

for (const [expected, vector] of Object.entries(centers) as Array<[VbtiSubsystem, VbtiVector]>) {
  const subsystem = matchSubsystem({ vector });
  if (subsystem.matchedSubsystem !== expected) {
    throw new Error(`expected ${expected}, got ${subsystem.matchedSubsystem}`);
  }

  const full = matchVbti({ vector, personas: PERSONAS });
  if (full.matchedSubsystem !== expected) {
    throw new Error(`matchVbti expected ${expected}, got ${full.matchedSubsystem}`);
  }
  if (full.persona.subsystem !== expected) {
    throw new Error(`persona ${full.persona.id} should belong to ${expected}`);
  }
  if (full.poolPosition.total < 3) {
    throw new Error(`expected at least 3 personas in ${expected}, got ${full.poolPosition.total}`);
  }
}

const robotFallback = matchVbti({
  vector: { contrast: 10, drama: 2, z1: 95, z2: 5, z3: 30 },
  personas: PERSONAS,
});
if (robotFallback.matchedPersonaId !== "error_404_announcer") {
  throw new Error(`silent/invalid fallback should hit error_404_announcer, got ${robotFallback.matchedPersonaId}`);
}

console.log("VBTI MATCHING SMOKE: OK");
