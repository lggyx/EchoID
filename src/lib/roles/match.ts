// Weighted Euclidean role matcher in 6-D dimension space.
// Each dimension is normalized 0..1 (score/100) before distance is computed,
// then per-dimension weights are applied so that "signature" dimensions
// (tempo, expressiveness, decision, communication) dominate matching over
// broader traits (presence, depth). Distance is sqrt(Σ w_i·(u_i - c_i)²).

import type { Dimension, DimensionKey, RoleTemplate } from "@/types/core";
import { DIMENSION_KEYS } from "@/types/core";
import { ROLE_LIBRARY } from "@/lib/roles/library";

const DIM_WEIGHTS: Record<DimensionKey, number> = {
  thinking_tempo: 1.2,
  emotional_expressiveness: 1.15,
  presence: 0.9,
  decision_style: 1.1,
  communication_style: 1.15,
  thinking_depth: 0.85,
};

function distance(userVec: Record<DimensionKey, number>, role: RoleTemplate): number {
  let sum = 0;
  for (const key of DIMENSION_KEYS) {
    const u = userVec[key] / 100;
    const c = role.center[key] / 100;
    const d = u - c;
    sum += DIM_WEIGHTS[key] * d * d;
  }
  return Math.sqrt(sum);
}

export interface MatchResult {
  role: RoleTemplate;
  distance: number;
  topN: RoleTemplate[];
}

/**
 * Match user dimensions against a role library.
 * Returns the closest role, its distance, and the top-3 candidates (closest first).
 */
export function matchRole(
  dims: Dimension[],
  library: RoleTemplate[] = ROLE_LIBRARY,
): MatchResult {
  if (library.length === 0) {
    throw new Error("matchRole: role library is empty");
  }

  const userVec = {} as Record<DimensionKey, number>;
  for (const key of DIMENSION_KEYS) {
    const found = dims.find((d) => d.key === key);
    userVec[key] = found ? found.score : 50;
  }

  const ranked = library
    .map((role) => ({ role, distance: distance(userVec, role) }))
    .sort((a, b) => a.distance - b.distance);

  const topN = ranked.slice(0, 3).map((r) => r.role);
  return { role: ranked[0].role, distance: ranked[0].distance, topN };
}
