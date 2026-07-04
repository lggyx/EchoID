# VBTI Track A Phase 2/4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Track A's VBTI algorithm layer: real Phase 2 acoustic features, short-segment baselines, contrast/drama scoring helpers, and Phase 4 subsystem/persona matching that can replace `feat/backend-integration`'s `pipeline-segmented.ts` placeholders.

**Architecture:** Keep legacy EchoID single-segment scoring intact while adding VBTI-specific helpers beside it. Use camelCase fields in TypeScript (`peakDensity`, `pauseRegularity`, `burstStops`) and align with feat-c's segmented contract (`matchedSubsystem`, `matchedPersonaId`, `evidenceJson`). Matching is data-driven: config + persona array + pure functions.

**Tech Stack:** Next.js 14, TypeScript, Prisma, local smoke tests with `tsx`, existing DSP helpers in `src/lib/features`.

---

### Task 1: Feature Helper Tests

**Files:**
- Create: `src/lib/features/__tests__/vbti-features.smoke.ts`
- Create: `src/lib/features/vbti.ts`

- [ ] **Step 1: Write the failing smoke test**

```ts
import { computeVbtiFrameFeatures } from "@/lib/features/vbti";
import type { Segment } from "@/lib/features/vad";

function approx(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
  }
}

const sampleRate = 16000;
const duration = 4;
const rms = new Float32Array([0.02, 0.2, 0.04, 0.22, 0.03, 0.21, 0.02, 0.19]);
const f0 = new Float32Array([0, 180, 150, 210, 0, 205, 160, 190]);
const voiced = new Uint8Array([0, 1, 1, 1, 0, 1, 1, 1]);
const pauses: Segment[] = [
  { start: 0.8, end: 1.0, startFrame: 80, endFrame: 100 },
  { start: 1.8, end: 2.0, startFrame: 180, endFrame: 200 },
  { start: 2.8, end: 3.0, startFrame: 280, endFrame: 300 },
];
const speech: Segment[] = [
  { start: 0.0, end: 0.8, startFrame: 0, endFrame: 80 },
  { start: 1.0, end: 1.8, startFrame: 100, endFrame: 180 },
  { start: 2.0, end: 2.8, startFrame: 200, endFrame: 280 },
  { start: 3.0, end: 4.0, startFrame: 300, endFrame: 400 },
];

const features = computeVbtiFrameFeatures({ rms, f0, voiced, pauses, speech, duration, sampleRate });

if (features.peakDensity <= 0) throw new Error(`peakDensity should be positive, got ${features.peakDensity}`);
approx(features.pauseRegularity, 1, 0.01, "regular pauses");
if (features.burstStops < 3) throw new Error(`burstStops should count speech-pause-speech transitions, got ${features.burstStops}`);

console.log("VBTI FEATURE SMOKE: OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/features/__tests__/vbti-features.smoke.ts`

Expected: FAIL because `src/lib/features/vbti.ts` does not exist.

- [ ] **Step 3: Implement minimal feature helper**

Create `computeVbtiFrameFeatures()` with:
- `peakDensity`: count debounced local maxima from RMS and voiced F0 streams, divide by duration.
- `pauseRegularity`: for fewer than 3 pauses return `0.5`; otherwise compute CV of pause start intervals and return `1 - clip01(CV)`.
- `burstStops`: count pause/silence gaps with speech on both sides.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/lib/features/__tests__/vbti-features.smoke.ts`

Expected: `VBTI FEATURE SMOKE: OK`.

### Task 2: Integrate Features Into Extractor

**Files:**
- Modify: `src/types/core.ts`
- Modify: `src/lib/features/extract.ts`
- Modify: `src/lib/scoring/baselines.ts`
- Modify: `src/lib/scoring/__tests__/scoring.smoke.ts`
- Modify: `src/lib/features/__tests__/extract.smoke.ts`

- [ ] **Step 1: Extend `AcousticFeatures`**

Add:
- `peakDensity: number`
- `pauseRegularity: number`
- `burstStops: number`

- [ ] **Step 2: Call helper from extractor**

After RMS/Pitch/VAD are computed, call `computeVbtiFrameFeatures()` and include its fields in the returned object.

- [ ] **Step 3: Update baselines and fixtures**

Add conservative ranges:
- `peakDensity: { min: 0, max: 6 }`
- `pauseRegularity: { min: 0, max: 1 }`
- `burstStops: { min: 0, max: 8 }`

- [ ] **Step 4: Verify extractor and typecheck**

Run:
- `npx tsx src/lib/features/__tests__/extract.smoke.ts`
- `npx tsx src/lib/scoring/__tests__/scoring.smoke.ts`
- `npx tsc --noEmit`

Expected: all pass.

### Task 3: VBTI Scoring Helpers

**Files:**
- Create: `src/lib/scoring/baselines.segment.ts`
- Create: `src/lib/scoring/vbti.ts`
- Create: `src/lib/scoring/__tests__/vbti.smoke.ts`
- Modify: `src/types/core.ts`

- [ ] **Step 1: Write failing scoring smoke**

Create fixtures that prove high `peakDensity/f0Std/rmsDr` raises drama, `semanticArousal` distance raises contrast, and stable speech-rate variance raises z1.

- [ ] **Step 2: Add types**

Add `VbtiVector`, `TriggeredSignature`, and `ContrastResult` types in `src/types/core.ts`.

- [ ] **Step 3: Implement scoring**

Implement:
- `deriveAcousticArousal(features)`
- `deriveDramaDensity(features)`
- `computeContrastResult(segments)`
- `aggregateVbtiVector(segmentReadings)`

- [ ] **Step 4: Verify**

Run:
- `npx tsx src/lib/scoring/__tests__/vbti.smoke.ts`
- `npx tsc --noEmit`

Expected: all pass.

### Task 4: Matching And Personas

**Files:**
- Create: `src/lib/matching/config.ts`
- Create: `src/lib/matching/subsystem.ts`
- Create: `src/lib/matching/persona.ts`
- Create: `src/lib/matching/__tests__/matching.smoke.ts`
- Create: `src/lib/personas/personas.ts`
- Modify: `src/types/core.ts`

- [ ] **Step 1: Write failing matching smoke**

Create five vectors near the PRD subsystem centers and assert they match `film`, `variety`, `stage`, `robot`, and `street`.

- [ ] **Step 2: Add data types**

Add `SubsystemKey`, `Persona`, `PersonaMatchResult`, and VBTI `AnalysisProfile` compatibility fields without removing legacy EchoID types yet.

- [ ] **Step 3: Implement subsystem matching**

Use PRD centers and Manhattan distance over `(x, y, z1, z2, z3)`, with `SIGNATURE_BONUS = 0.30`.

- [ ] **Step 4: Implement persona selection**

Use data-driven personas with `kind: "rare" | "fallback" | "regular"`, optional trigger, optional center, and deterministic nearest-neighbor fallback inside subsystem.

- [ ] **Step 5: Verify**

Run:
- `npx tsx src/lib/matching/__tests__/matching.smoke.ts`
- `npx tsc --noEmit`

Expected: all pass.

### Task 5: Phase 0 C Documentation Alignment

**Files:**
- Modify: `docs/phase-0-conclusion.md`
- Modify: `scripts/phase-0-spike/contrast-spike.ts`

- [ ] **Step 1: Record C decision**

Update conclusion wording from strict fallback to "TTS spread fails original >40 threshold; team accepts threshold 20-25 for TTS and continues with Phase 2 while documenting risk."

- [ ] **Step 2: Keep original PRD threshold visible**

Do not erase the original `>40` criterion; add an explicit "C decision" block so future readers can see the deviation.

- [ ] **Step 3: Verify docs/scripts are coherent**

Run: `rg -n "threshold|Phase 0|C decision|spread" docs/phase-0-conclusion.md scripts/phase-0-spike/contrast-spike.ts`

Expected: both original PRD threshold and accepted continuation threshold are discoverable.

### Task 6: Final Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run focused smoke tests**

Run:
- `npx tsx src/lib/features/__tests__/vbti-features.smoke.ts`
- `npx tsx src/lib/features/__tests__/extract.smoke.ts`
- `npx tsx src/lib/scoring/__tests__/vbti.smoke.ts`
- `npx tsx src/lib/matching/__tests__/matching.smoke.ts`

- [ ] **Step 2: Run full typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Inspect worktree**

Run: `git status --short`

Expected: only intentional Track A files are changed, plus pre-existing Phase 0/provider files.
