import type { AcousticFeatures, EvidenceItem, TriggeredSignal, VbtiSubsystem, VbtiVector } from "@/types/core";

export const SUBSYSTEM_CENTERS: Record<VbtiSubsystem, VbtiVector> = {
  film: { contrast: 75, drama: 55, z1: 60, z2: 55, z3: 50 },
  variety: { contrast: 55, drama: 90, z1: 20, z2: 65, z3: 30 },
  stage: { contrast: 25, drama: 80, z1: 90, z2: 65, z3: 95 },
  robot: { contrast: 40, drama: 10, z1: 90, z2: 50, z3: 50 },
  street: { contrast: 20, drama: 95, z1: 25, z2: 95, z3: 20 },
};

export const SUBSYSTEM_TITLES: Record<VbtiSubsystem, string> = {
  film: "影视组",
  variety: "综艺组",
  stage: "舞台组",
  robot: "机器人组",
  street: "街头组",
};

export const SIGNATURE_BONUS = 0.3;

export interface SignatureTriggerConfig {
  id: string;
  label: string;
  subsystem: VbtiSubsystem;
  matches(input: { vector: VbtiVector; features?: AcousticFeatures }): boolean;
  evidence(input: { vector: VbtiVector; features?: AcousticFeatures }): EvidenceItem[];
}

export const SIGNATURE_TRIGGERS: SignatureTriggerConfig[] = [
  {
    id: "film_high_contrast",
    label: "内容和声音明显反着来",
    subsystem: "film",
    matches: ({ vector }) => vector.contrast >= 65 && vector.drama >= 40 && vector.drama <= 75,
    evidence: ({ vector }) => [metric("contrast", "反差率", vector.contrast, "%", "语义激动和声学激动拉开了距离")],
  },
  {
    id: "variety_burst_peak",
    label: "急停急启和峰值都很密",
    subsystem: "variety",
    matches: ({ vector, features }) =>
      vector.drama >= 75 || (features?.burstStops ?? 0) >= 3 || (features?.peakDensity ?? 0) >= 3.5,
    evidence: ({ vector, features }) => [
      metric("drama", "抓马浓度", vector.drama, "%", "声音起伏和节奏峰值比较密"),
      metric("burstStops", "急停急启", features?.burstStops ?? 0, "次", "短时间内多次停顿再启动"),
    ],
  },
  {
    id: "stage_monologue",
    label: "稳定长句独白感",
    subsystem: "stage",
    matches: ({ vector }) => vector.z1 >= 70 && vector.z3 >= 75,
    evidence: ({ vector }) => [
      metric("z1", "语速稳定性", vector.z1, "%", "语流稳定"),
      metric("z3", "独白倾向", vector.z3, "%", "句子更像舞台独白"),
    ],
  },
  {
    id: "robot_low_drama",
    label: "低抓马稳定播报",
    subsystem: "robot",
    matches: ({ vector }) => vector.drama <= 18 && vector.z1 >= 70,
    evidence: ({ vector }) => [
      metric("drama", "抓马浓度", vector.drama, "%", "声音几乎不抬戏"),
      metric("z1", "语速稳定性", vector.z1, "%", "节奏像播报器一样稳"),
    ],
  },
  {
    id: "street_loud_drama",
    label: "高音量高抓马外放",
    subsystem: "street",
    matches: ({ vector }) => vector.drama >= 80 && vector.z2 >= 75,
    evidence: ({ vector }) => [
      metric("drama", "抓马浓度", vector.drama, "%", "现场感很强"),
      metric("z2", "音量强度", vector.z2, "%", "声音能量往外顶"),
    ],
  },
];

export const SUBSYSTEM_KEYS = Object.keys(SUBSYSTEM_CENTERS) as VbtiSubsystem[];

function metric(key: string, label: string, value: number, unit: string, text: string): EvidenceItem {
  return { key, label, value: Math.round(value), unit, text };
}

export function triggerToSignal(trigger: SignatureTriggerConfig, input: { vector: VbtiVector; features?: AcousticFeatures }): TriggeredSignal {
  return {
    id: trigger.id,
    label: trigger.label,
    subsystem: trigger.subsystem,
    bonus: SIGNATURE_BONUS,
    evidence: trigger.evidence(input),
  };
}
