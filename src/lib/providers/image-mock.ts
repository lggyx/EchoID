import { promises as fs } from "node:fs";
import path from "node:path";
import type { ImageProvider } from "@/types/core";

/**
 * Mock image provider — draws a 16personalities-style chibi character portrait
 * for each matched role as pure SVG (no external assets, no fonts required).
 *
 * Composition (720×900 canvas):
 *   - Pastel gradient background with a few decorative shapes.
 *   - Character standing in the bottom half, ~1:3 head-to-body ratio.
 *   - Character holds a role-specific prop.
 *   - Face is a friendly minimal expression (two dot eyes + smile + cheeks).
 *   - Optional accessories (glasses, earphones, headband).
 *
 * The URL is served via /api/storage/images/... so it renders without 404.
 */
export class MockImageProvider implements ImageProvider {
  constructor(private storageDir: string) {}

  async generate(prompt: string, opts?: { roleId?: string }): Promise<{ url: string }> {
    const roleId = opts?.roleId ?? "generic";
    const config = ROLE_CONFIGS[roleId] ?? ROLE_CONFIGS.generic;
    const id = `${roleId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${id}.svg`;

    const svg = renderCharacter(roleId, config);

    const imagesDir = path.join(this.storageDir, "images");
    await fs.mkdir(imagesDir, { recursive: true });
    await fs.writeFile(path.join(imagesDir, filename), svg, "utf8");

    return { url: `/api/storage/images/${filename}` };
  }
}

// ============================================================================
// Character config
// ============================================================================

type HairStyle = "short" | "long" | "bun" | "messy" | "bob" | "wavy";
type Accessory = "none" | "glasses" | "headphones" | "headband" | "mic-boom";
type Pose = "hold-front" | "hold-side" | "wave" | "arms-crossed" | "point-up" | "hold-book";
type PropKind =
  | "mic-vintage"
  | "pointer"
  | "teacup"
  | "briefcase"
  | "book-open"
  | "sparkle-mic"
  | "cushion"
  | "podium"
  | "question-bubble"
  | "lightbulb"
  | "pompom"
  | "scroll";

interface CharacterConfig {
  bgTop: string;
  bgBottom: string;
  decorColor: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  shirtAccent: string;
  pants: string;
  shoes: string;
  accessory: Accessory;
  accessoryColor: string;
  pose: Pose;
  prop: PropKind;
  propMain: string;
  propAccent: string;
}

// A neutral fallback so we never fail to render.
const GENERIC: CharacterConfig = {
  bgTop: "#fce8d5",
  bgBottom: "#f2c88e",
  decorColor: "#e08a4f",
  skin: "#f4c9a6",
  hair: "#3a2a1a",
  hairStyle: "short",
  shirt: "#4a7fb5",
  shirtAccent: "#2f5a85",
  pants: "#2a2f45",
  shoes: "#1a1a20",
  accessory: "none",
  accessoryColor: "#0e0e10",
  pose: "hold-front",
  prop: "book-open",
  propMain: "#f5f2ea",
  propAccent: "#c94a4a",
};

const ROLE_CONFIGS: Record<string, CharacterConfig> = {
  generic: GENERIC,

  late_night_radio_host: {
    bgTop: "#1a2246",
    bgBottom: "#3a3f7d",
    decorColor: "#f0c56a",
    skin: "#e6b58a",
    hair: "#1a1218",
    hairStyle: "bob",
    shirt: "#2a2438",
    shirtAccent: "#c98a4b",
    pants: "#141422",
    shoes: "#0a0a12",
    accessory: "headphones",
    accessoryColor: "#c98a4b",
    pose: "hold-front",
    prop: "mic-vintage",
    propMain: "#c98a4b",
    propAccent: "#3a2a18",
  },

  rapid_lecturer: {
    bgTop: "#ffe0d5",
    bgBottom: "#ffb08a",
    decorColor: "#d94a2c",
    skin: "#f4c9a6",
    hair: "#2a1a10",
    hairStyle: "short",
    shirt: "#d94a2c",
    shirtAccent: "#8a2a18",
    pants: "#2a1f18",
    shoes: "#1a1210",
    accessory: "glasses",
    accessoryColor: "#0e0e10",
    pose: "point-up",
    prop: "pointer",
    propMain: "#e6d5a8",
    propAccent: "#8a2a18",
  },

  neighbor_chatter: {
    bgTop: "#fff2d8",
    bgBottom: "#f5c47a",
    decorColor: "#e58a3d",
    skin: "#f0b990",
    hair: "#4a2818",
    hairStyle: "wavy",
    shirt: "#e58a3d",
    shirtAccent: "#a55618",
    pants: "#3d6a53",
    shoes: "#241a12",
    accessory: "none",
    accessoryColor: "#0e0e10",
    pose: "wave",
    prop: "teacup",
    propMain: "#f5f2ea",
    propAccent: "#d17a3a",
  },

  steady_decision_maker: {
    bgTop: "#e0e8f0",
    bgBottom: "#a8b8cc",
    decorColor: "#2b4a6d",
    skin: "#ecc5a2",
    hair: "#1a1a24",
    hairStyle: "short",
    shirt: "#2b4a6d",
    shirtAccent: "#1a3050",
    pants: "#1a2030",
    shoes: "#0a0a10",
    accessory: "glasses",
    accessoryColor: "#1a1a24",
    pose: "arms-crossed",
    prop: "briefcase",
    propMain: "#5a3a20",
    propAccent: "#c4b48c",
  },

  poet_reader: {
    bgTop: "#3a2a48",
    bgBottom: "#8a4a68",
    decorColor: "#f0d896",
    skin: "#f0c9a6",
    hair: "#1a1218",
    hairStyle: "long",
    shirt: "#8a3d5b",
    shirtAccent: "#5a2540",
    pants: "#2a1a30",
    shoes: "#1a1018",
    accessory: "none",
    accessoryColor: "#0e0e10",
    pose: "hold-book",
    prop: "book-open",
    propMain: "#f5ecd5",
    propAccent: "#8a3d5b",
  },

  standup_performer: {
    bgTop: "#fff0d5",
    bgBottom: "#ffb84a",
    decorColor: "#e0623f",
    skin: "#f2c090",
    hair: "#2a1810",
    hairStyle: "messy",
    shirt: "#e0623f",
    shirtAccent: "#8a3018",
    pants: "#1a1a1a",
    shoes: "#0a0a0a",
    accessory: "none",
    accessoryColor: "#0e0e10",
    pose: "hold-front",
    prop: "sparkle-mic",
    propMain: "#f1c15a",
    propAccent: "#e0623f",
  },

  gentle_hollow: {
    bgTop: "#e5f0ec",
    bgBottom: "#a8cec4",
    decorColor: "#7fa7a3",
    skin: "#f4d0b0",
    hair: "#3a2a2a",
    hairStyle: "bun",
    shirt: "#a8cec4",
    shirtAccent: "#7fa7a3",
    pants: "#4a5a5a",
    shoes: "#2a2a2a",
    accessory: "none",
    accessoryColor: "#0e0e10",
    pose: "hold-front",
    prop: "cushion",
    propMain: "#d6bfa2",
    propAccent: "#a58a68",
  },

  boardroom_speaker: {
    bgTop: "#f0ecdc",
    bgBottom: "#c4b48c",
    decorColor: "#334155",
    skin: "#ecc0a0",
    hair: "#1a1a20",
    hairStyle: "short",
    shirt: "#334155",
    shirtAccent: "#1e2838",
    pants: "#1a1f2a",
    shoes: "#0a0a12",
    accessory: "glasses",
    accessoryColor: "#334155",
    pose: "point-up",
    prop: "podium",
    propMain: "#8a6a3a",
    propAccent: "#5a3f1a",
  },

  curious_asker: {
    bgTop: "#f8d5e0",
    bgBottom: "#e88fb0",
    decorColor: "#c94a7d",
    skin: "#f4c090",
    hair: "#3a1830",
    hairStyle: "wavy",
    shirt: "#c94a7d",
    shirtAccent: "#8a2a58",
    pants: "#4a8a9d",
    shoes: "#1a1a24",
    accessory: "none",
    accessoryColor: "#0e0e10",
    pose: "point-up",
    prop: "question-bubble",
    propMain: "#f8d5e0",
    propAccent: "#c94a7d",
  },

  deep_philosopher: {
    bgTop: "#2a2f3d",
    bgBottom: "#3d4a5d",
    decorColor: "#e6c078",
    skin: "#e6b58a",
    hair: "#141018",
    hairStyle: "bun",
    shirt: "#3d4a5d",
    shirtAccent: "#252f3d",
    pants: "#1a1f28",
    shoes: "#0a0d12",
    accessory: "glasses",
    accessoryColor: "#e6c078",
    pose: "hold-side",
    prop: "lightbulb",
    propMain: "#f5d878",
    propAccent: "#8a6a2a",
  },

  cheerleader: {
    bgTop: "#fff5d5",
    bgBottom: "#ffd35a",
    decorColor: "#e6a53a",
    skin: "#f4c9a6",
    hair: "#8a3018",
    hairStyle: "messy",
    shirt: "#d94a68",
    shirtAccent: "#8a2a3a",
    pants: "#e6a53a",
    shoes: "#f5f2ea",
    accessory: "headband",
    accessoryColor: "#d94a68",
    pose: "wave",
    prop: "pompom",
    propMain: "#e6a53a",
    propAccent: "#d94a68",
  },

  calm_narrator: {
    bgTop: "#e8eee0",
    bgBottom: "#a8c0a0",
    decorColor: "#4a6d5b",
    skin: "#ecc0a0",
    hair: "#241a14",
    hairStyle: "bob",
    shirt: "#4a6d5b",
    shirtAccent: "#2f4a3a",
    pants: "#2a3a30",
    shoes: "#141a14",
    accessory: "none",
    accessoryColor: "#0e0e10",
    pose: "hold-book",
    prop: "scroll",
    propMain: "#f0e5c8",
    propAccent: "#8a6a3a",
  },
};

// ============================================================================
// Rendering
// ============================================================================

const W = 720;
const H = 900;
const CX = W / 2;

function renderCharacter(roleId: string, c: CharacterConfig): string {
  const parts: string[] = [];
  parts.push(bg(c));
  parts.push(decorations(c));
  parts.push(shadow());
  parts.push(character(c));
  parts.push(topMark());
  parts.push(bottomBadge(roleId, c));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c.bgTop}"/>
      <stop offset="100%" stop-color="${c.bgBottom}"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${parts.join("\n  ")}
</svg>`;
}

function bg(c: CharacterConfig): string {
  return `<rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#halo)"/>`;
}

/** A scattering of soft dots + one large circle behind the character. */
function decorations(c: CharacterConfig): string {
  const dots = [
    [80, 140, 8], [140, 90, 5], [200, 180, 4],
    [W - 90, 130, 7], [W - 160, 90, 4], [W - 200, 200, 5],
    [90, 720, 6], [W - 100, 700, 5],
  ];
  const dotEls = dots
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c.decorColor}" opacity="0.35"/>`)
    .join("");
  // Big translucent disc behind character head.
  const disc = `<circle cx="${CX}" cy="440" r="240" fill="#ffffff" opacity="0.18"/>`;
  // A few sparkle plus-signs.
  const spark = (x: number, y: number, s = 10, color = "#ffffff") =>
    `<g transform="translate(${x} ${y})" opacity="0.7">
       <path d="M -${s} 0 L ${s} 0 M 0 -${s} L 0 ${s}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
     </g>`;
  const sparks =
    spark(120, 260, 8) +
    spark(W - 130, 280, 10) +
    spark(180, 640, 7) +
    spark(W - 170, 620, 9);
  return disc + dotEls + sparks;
}

function shadow(): string {
  // Soft ground ellipse under the character.
  return `<ellipse cx="${CX}" cy="800" rx="150" ry="14" fill="#000000" opacity="0.12"/>`;
}

// --- Character composition ---

function character(c: CharacterConfig): string {
  // Anchor: feet around y=795 (just above shadow). Assemble bottom-up.
  const feetY = 795;
  const shoeH = 20;

  // Layer order: back arm → legs → body → front arm → head → prop (if in front-hand) → accessory
  // We prepare pieces then order them.
  const pose = c.pose;

  // Legs (two short capsules).
  const legs = `
    <rect x="${CX - 42}" y="${feetY - 130}" width="34" height="130" rx="16" fill="${c.pants}"/>
    <rect x="${CX + 8}" y="${feetY - 130}" width="34" height="130" rx="16" fill="${c.pants}"/>
    <ellipse cx="${CX - 25}" cy="${feetY}" rx="26" ry="${shoeH / 2}" fill="${c.shoes}"/>
    <ellipse cx="${CX + 25}" cy="${feetY}" rx="26" ry="${shoeH / 2}" fill="${c.shoes}"/>
  `;

  // Body (rounded torso shape).
  const bodyTop = feetY - 130 - 190; // 190px torso height
  const body = `
    <path d="
      M ${CX - 95} ${bodyTop + 30}
      Q ${CX - 105} ${bodyTop} ${CX - 40} ${bodyTop - 8}
      L ${CX + 40} ${bodyTop - 8}
      Q ${CX + 105} ${bodyTop} ${CX + 95} ${bodyTop + 30}
      L ${CX + 88} ${bodyTop + 190}
      Q ${CX} ${bodyTop + 205} ${CX - 88} ${bodyTop + 190} Z
    " fill="${c.shirt}"/>
    <path d="
      M ${CX - 20} ${bodyTop - 6}
      L ${CX} ${bodyTop + 45}
      L ${CX + 20} ${bodyTop - 6} Z
    " fill="${c.shirtAccent}" opacity="0.85"/>
    <!-- shirt pocket / detail -->
    <circle cx="${CX + 50}" cy="${bodyTop + 60}" r="4" fill="${c.shirtAccent}"/>
    <circle cx="${CX + 50}" cy="${bodyTop + 78}" r="4" fill="${c.shirtAccent}"/>
  `;

  // Head — big for chibi proportion.
  const headCX = CX;
  const headCY = bodyTop - 130;
  const headR = 120;
  const head = renderHead(headCX, headCY, headR, c);

  // Arms + prop depending on pose.
  const armsAndProp = renderArms(headCX, bodyTop, c);

  return `${legs}${body}${armsAndProp.back}${head}${armsAndProp.front}`;
}

function renderHead(cx: number, cy: number, r: number, c: CharacterConfig): string {
  // Face shape — a soft rounded rect / circle blend for the chibi cheek shape.
  const face = `<ellipse cx="${cx}" cy="${cy + 8}" rx="${r * 0.9}" ry="${r}" fill="${c.skin}"/>`;
  const ears = `
    <ellipse cx="${cx - r * 0.9}" cy="${cy + 20}" rx="14" ry="20" fill="${c.skin}"/>
    <ellipse cx="${cx + r * 0.9}" cy="${cy + 20}" rx="14" ry="20" fill="${c.skin}"/>
  `;
  const hair = renderHair(cx, cy, r, c.hair, c.hairStyle);
  const face2 = renderFace(cx, cy + 20, r, c);
  const accessory = renderAccessory(cx, cy, r, c);
  // Neck.
  const neck = `<rect x="${cx - 22}" y="${cy + r - 10}" width="44" height="30" fill="${c.skin}"/>`;
  return `${ears}${face}${hair}${face2}${accessory}${neck}`;
}

function renderHair(cx: number, cy: number, r: number, color: string, style: HairStyle): string {
  switch (style) {
    case "short":
      return `<path d="
        M ${cx - r * 0.95} ${cy - 10}
        Q ${cx - r * 0.7} ${cy - r - 5} ${cx} ${cy - r - 10}
        Q ${cx + r * 0.7} ${cy - r - 5} ${cx + r * 0.95} ${cy - 10}
        Q ${cx + r * 0.9} ${cy - r * 0.5} ${cx + r * 0.55} ${cy - r * 0.6}
        Q ${cx + r * 0.2} ${cy - r * 0.35} ${cx - r * 0.1} ${cy - r * 0.55}
        Q ${cx - r * 0.6} ${cy - r * 0.7} ${cx - r * 0.95} ${cy - 10} Z
      " fill="${color}"/>`;
    case "long":
      return `<path d="
        M ${cx - r * 0.95} ${cy + r * 0.9}
        Q ${cx - r * 1.05} ${cy} ${cx - r * 0.85} ${cy - r * 0.7}
        Q ${cx - r * 0.4} ${cy - r - 5} ${cx} ${cy - r - 10}
        Q ${cx + r * 0.4} ${cy - r - 5} ${cx + r * 0.85} ${cy - r * 0.7}
        Q ${cx + r * 1.05} ${cy} ${cx + r * 0.95} ${cy + r * 0.9}
        Q ${cx + r * 0.8} ${cy + r * 0.4} ${cx + r * 0.75} ${cy - r * 0.1}
        Q ${cx + r * 0.4} ${cy - r * 0.35} ${cx} ${cy - r * 0.4}
        Q ${cx - r * 0.4} ${cy - r * 0.35} ${cx - r * 0.75} ${cy - r * 0.1}
        Q ${cx - r * 0.8} ${cy + r * 0.4} ${cx - r * 0.95} ${cy + r * 0.9} Z
      " fill="${color}"/>`;
    case "bun":
      return `
        <circle cx="${cx}" cy="${cy - r + 6}" r="30" fill="${color}"/>
        <path d="
          M ${cx - r * 0.9} ${cy - 5}
          Q ${cx - r * 0.6} ${cy - r} ${cx} ${cy - r * 0.85}
          Q ${cx + r * 0.6} ${cy - r} ${cx + r * 0.9} ${cy - 5}
          Q ${cx + r * 0.6} ${cy - r * 0.35} ${cx} ${cy - r * 0.45}
          Q ${cx - r * 0.6} ${cy - r * 0.35} ${cx - r * 0.9} ${cy - 5} Z
        " fill="${color}"/>
      `;
    case "bob":
      return `<path d="
        M ${cx - r * 0.95} ${cy + r * 0.3}
        Q ${cx - r * 1} ${cy - r * 0.4} ${cx - r * 0.6} ${cy - r * 0.9}
        Q ${cx} ${cy - r - 10} ${cx + r * 0.6} ${cy - r * 0.9}
        Q ${cx + r * 1} ${cy - r * 0.4} ${cx + r * 0.95} ${cy + r * 0.3}
        Q ${cx + r * 0.7} ${cy - r * 0.05} ${cx + r * 0.35} ${cy - r * 0.3}
        Q ${cx} ${cy - r * 0.55} ${cx - r * 0.35} ${cy - r * 0.3}
        Q ${cx - r * 0.7} ${cy - r * 0.05} ${cx - r * 0.95} ${cy + r * 0.3} Z
      " fill="${color}"/>`;
    case "messy":
      return `<path d="
        M ${cx - r * 0.95} ${cy}
        L ${cx - r * 0.8} ${cy - r * 0.9}
        L ${cx - r * 0.4} ${cy - r * 0.6}
        L ${cx - r * 0.2} ${cy - r - 5}
        L ${cx + r * 0.05} ${cy - r * 0.55}
        L ${cx + r * 0.35} ${cy - r - 5}
        L ${cx + r * 0.55} ${cy - r * 0.6}
        L ${cx + r * 0.85} ${cy - r * 0.85}
        L ${cx + r * 0.95} ${cy}
        Q ${cx + r * 0.6} ${cy - r * 0.3} ${cx + r * 0.2} ${cy - r * 0.4}
        Q ${cx - r * 0.2} ${cy - r * 0.4} ${cx - r * 0.6} ${cy - r * 0.3}
        Q ${cx - r * 0.85} ${cy - r * 0.15} ${cx - r * 0.95} ${cy} Z
      " fill="${color}"/>`;
    case "wavy":
      return `<path d="
        M ${cx - r * 0.95} ${cy + r * 0.7}
        Q ${cx - r * 1.05} ${cy - r * 0.2} ${cx - r * 0.75} ${cy - r * 0.8}
        Q ${cx - r * 0.35} ${cy - r - 10} ${cx} ${cy - r - 8}
        Q ${cx + r * 0.35} ${cy - r - 10} ${cx + r * 0.75} ${cy - r * 0.8}
        Q ${cx + r * 1.05} ${cy - r * 0.2} ${cx + r * 0.95} ${cy + r * 0.7}
        Q ${cx + r * 0.85} ${cy + r * 0.2} ${cx + r * 0.7} ${cy - r * 0.05}
        Q ${cx + r * 0.4} ${cy - r * 0.3} ${cx} ${cy - r * 0.35}
        Q ${cx - r * 0.4} ${cy - r * 0.3} ${cx - r * 0.7} ${cy - r * 0.05}
        Q ${cx - r * 0.85} ${cy + r * 0.2} ${cx - r * 0.95} ${cy + r * 0.7} Z
      " fill="${color}"/>`;
  }
}

function renderFace(cx: number, cy: number, r: number, c: CharacterConfig): string {
  // Eyes — simple black dots with a highlight.
  const eyeY = cy;
  const eyeDX = 32;
  const eye = (x: number) => `
    <ellipse cx="${x}" cy="${eyeY}" rx="7" ry="9" fill="#1a1a24"/>
    <circle cx="${x + 2}" cy="${eyeY - 3}" r="2" fill="#ffffff"/>
  `;
  // Cheeks — soft pink blush.
  const cheek = (x: number) => `<ellipse cx="${x}" cy="${eyeY + 22}" rx="14" ry="7" fill="#e88a8a" opacity="0.55"/>`;
  // Smile — subtle curve.
  const smile = `<path d="M ${cx - 10} ${eyeY + 22} Q ${cx} ${eyeY + 30} ${cx + 10} ${eyeY + 22}"
    stroke="#3a1f18" stroke-width="2.5" stroke-linecap="round" fill="none"/>`;
  // Nose hint — a tiny arc.
  const nose = `<path d="M ${cx - 2} ${eyeY + 10} Q ${cx} ${eyeY + 14} ${cx + 2} ${eyeY + 10}"
    stroke="#c99878" stroke-width="1.8" stroke-linecap="round" fill="none"/>`;
  return `${eye(cx - eyeDX)}${eye(cx + eyeDX)}${cheek(cx - eyeDX - 8)}${cheek(cx + eyeDX + 8)}${nose}${smile}`;
}

function renderAccessory(cx: number, cy: number, r: number, c: CharacterConfig): string {
  switch (c.accessory) {
    case "glasses": {
      const eyeY = cy + 20;
      const eyeDX = 32;
      const rr = 22;
      return `
        <g stroke="${c.accessoryColor}" stroke-width="3.5" fill="none">
          <rect x="${cx - eyeDX - rr}" y="${eyeY - rr / 2 - 4}" width="${rr * 2}" height="${rr}" rx="6"/>
          <rect x="${cx + eyeDX - rr}" y="${eyeY - rr / 2 - 4}" width="${rr * 2}" height="${rr}" rx="6"/>
          <line x1="${cx - eyeDX + rr}" y1="${eyeY - 4}" x2="${cx + eyeDX - rr}" y2="${eyeY - 4}"/>
        </g>
      `;
    }
    case "headphones": {
      const bandTop = cy - r * 0.75;
      return `
        <path d="M ${cx - r * 0.95} ${cy + 10} Q ${cx} ${bandTop - 20} ${cx + r * 0.95} ${cy + 10}"
          stroke="${c.accessoryColor}" stroke-width="10" fill="none" stroke-linecap="round"/>
        <rect x="${cx - r * 1.05}" y="${cy + 5}" width="26" height="38" rx="10" fill="${c.accessoryColor}"/>
        <rect x="${cx + r * 1.05 - 26}" y="${cy + 5}" width="26" height="38" rx="10" fill="${c.accessoryColor}"/>
      `;
    }
    case "headband": {
      return `
        <path d="M ${cx - r * 0.95} ${cy - r * 0.35} Q ${cx} ${cy - r * 0.75} ${cx + r * 0.95} ${cy - r * 0.35}
          L ${cx + r * 0.95} ${cy - r * 0.15} Q ${cx} ${cy - r * 0.55} ${cx - r * 0.95} ${cy - r * 0.15} Z"
          fill="${c.accessoryColor}"/>
        <circle cx="${cx - r * 0.7}" cy="${cy - r * 0.7}" r="10" fill="${c.accessoryColor}"/>
      `;
    }
    case "mic-boom": {
      // Thin boom curving from ear to mouth.
      return `
        <path d="M ${cx + r * 0.9} ${cy + 15} Q ${cx + r * 0.6} ${cy + 55} ${cx + r * 0.2} ${cy + 55}"
          stroke="${c.accessoryColor}" stroke-width="3" fill="none"/>
        <circle cx="${cx + r * 0.2}" cy="${cy + 55}" r="6" fill="${c.accessoryColor}"/>
      `;
    }
    case "none":
    default:
      return "";
  }
}

/**
 * Arms depending on pose. Returns two SVG fragments — "back" arm (drawn behind
 * body) and "front" arm + prop (drawn in front of body/head).
 */
function renderArms(cx: number, bodyTop: number, c: CharacterConfig): { back: string; front: string } {
  const skin = c.skin;
  const sleeve = c.shirtAccent;
  const shoulderY = bodyTop + 20;
  const shoulderLX = cx - 90;
  const shoulderRX = cx + 90;

  // Draw an "arm capsule" from shoulder to hand.
  const arm = (fromX: number, fromY: number, toX: number, toY: number, w = 26) => {
    // Two rects rotated? Simpler: use a stroked line with round caps + a small hand circle at the end.
    return `
      <line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}"
        stroke="${sleeve}" stroke-width="${w}" stroke-linecap="round"/>
      <circle cx="${toX}" cy="${toY}" r="16" fill="${skin}"/>
    `;
  };

  switch (c.pose) {
    case "hold-front": {
      // Both hands come forward holding the prop at chest height.
      const handY = bodyTop + 130;
      const handLX = cx - 38;
      const handRX = cx + 38;
      const back = arm(shoulderRX, shoulderY, handRX, handY, 26);
      const front = arm(shoulderLX, shoulderY, handLX, handY, 26) +
        renderProp(c.prop, cx, handY - 20, c.propMain, c.propAccent);
      return { back, front };
    }
    case "hold-side": {
      // One hand at side, prop hanging.
      const handRX = shoulderRX + 30;
      const handRY = bodyTop + 180;
      const back = arm(shoulderLX, shoulderY, shoulderLX - 20, bodyTop + 170, 24);
      const front = arm(shoulderRX, shoulderY, handRX, handRY, 26) +
        renderProp(c.prop, handRX + 10, handRY - 10, c.propMain, c.propAccent, 0.85);
      return { back, front };
    }
    case "wave": {
      // Right arm up in a friendly wave, left holds prop.
      const handRX = shoulderRX + 60;
      const handRY = shoulderY - 90;
      const handLX = cx - 60;
      const handLY = bodyTop + 150;
      const back = arm(shoulderRX, shoulderY, handRX, handRY, 26);
      const front = arm(shoulderLX, shoulderY, handLX, handLY, 26) +
        renderProp(c.prop, handLX - 5, handLY - 5, c.propMain, c.propAccent);
      return { back, front };
    }
    case "arms-crossed": {
      // Crossed at chest — prop tucked under one arm on the side.
      const crossY = bodyTop + 100;
      const back = `
        <path d="M ${shoulderRX} ${shoulderY} Q ${cx + 20} ${crossY - 20} ${cx - 60} ${crossY}"
          stroke="${sleeve}" stroke-width="26" fill="none" stroke-linecap="round"/>
        <circle cx="${cx - 60}" cy="${crossY}" r="16" fill="${skin}"/>
      `;
      const front = `
        <path d="M ${shoulderLX} ${shoulderY} Q ${cx - 20} ${crossY - 5} ${cx + 60} ${crossY - 10}"
          stroke="${sleeve}" stroke-width="26" fill="none" stroke-linecap="round"/>
        <circle cx="${cx + 60}" cy="${crossY - 10}" r="16" fill="${skin}"/>
        ${renderProp(c.prop, shoulderRX + 30, crossY + 30, c.propMain, c.propAccent, 0.75)}
      `;
      return { back, front };
    }
    case "point-up": {
      // Right hand up pointing/gesturing, left down holding prop.
      const handRX = shoulderRX + 20;
      const handRY = shoulderY - 110;
      const handLX = shoulderLX - 20;
      const handLY = bodyTop + 200;
      const back = arm(shoulderRX, shoulderY, handRX, handRY, 26) +
        // finger up
        `<rect x="${handRX - 4}" y="${handRY - 34}" width="10" height="26" rx="5" fill="${skin}"/>`;
      const front = arm(shoulderLX, shoulderY, handLX, handLY, 26) +
        renderProp(c.prop, handLX - 10, handLY - 10, c.propMain, c.propAccent, 0.9);
      return { back, front };
    }
    case "hold-book": {
      // Both hands forward, wider apart, holding book/scroll.
      const handY = bodyTop + 145;
      const handLX = cx - 90;
      const handRX = cx + 90;
      const back = arm(shoulderRX, shoulderY, handRX, handY, 26);
      const front = arm(shoulderLX, shoulderY, handLX, handY, 26) +
        renderProp(c.prop, cx, handY - 10, c.propMain, c.propAccent, 1.1);
      return { back, front };
    }
  }
}

// --- Props ---

function renderProp(
  kind: PropKind,
  cx: number,
  cy: number,
  main: string,
  accent: string,
  scale = 1,
): string {
  const g = (inner: string) =>
    `<g transform="translate(${cx} ${cy}) scale(${scale})">${inner}</g>`;

  switch (kind) {
    case "mic-vintage":
      return g(`
        <rect x="-8" y="-5" width="16" height="70" rx="6" fill="${accent}"/>
        <ellipse cx="0" cy="-25" rx="34" ry="42" fill="${main}"/>
        <g stroke="${accent}" stroke-width="2" opacity="0.7">
          <line x1="-24" y1="-50" x2="-24" y2="0"/>
          <line x1="-12" y1="-58" x2="-12" y2="8"/>
          <line x1="0" y1="-60" x2="0" y2="10"/>
          <line x1="12" y1="-58" x2="12" y2="8"/>
          <line x1="24" y1="-50" x2="24" y2="0"/>
        </g>
        <rect x="-14" y="-70" width="28" height="10" rx="4" fill="${accent}"/>
      `);
    case "pointer":
      return g(`
        <rect x="-4" y="-80" width="8" height="140" rx="4" fill="${main}"/>
        <circle cx="0" cy="-80" r="10" fill="${accent}"/>
      `);
    case "teacup":
      return g(`
        <path d="M -32 -5 L 32 -5 L 26 45 Q 0 55 -26 45 Z" fill="${main}"/>
        <ellipse cx="0" cy="-5" rx="32" ry="10" fill="${accent}" opacity="0.4"/>
        <path d="M 32 5 Q 55 5 55 25 Q 55 40 30 40" stroke="${main}" stroke-width="7" fill="none"/>
        <path d="M -18 -20 Q -14 -32 -10 -22 M 0 -22 Q 4 -34 8 -24 M 14 -20 Q 18 -32 22 -22"
          stroke="${accent}" stroke-width="2" fill="none" opacity="0.5"/>
      `);
    case "briefcase":
      return g(`
        <rect x="-45" y="-15" width="90" height="60" rx="6" fill="${main}"/>
        <rect x="-14" y="-30" width="28" height="18" rx="4" fill="none" stroke="${main}" stroke-width="5"/>
        <rect x="-6" y="10" width="12" height="10" rx="2" fill="${accent}"/>
        <line x1="-45" y1="14" x2="45" y2="14" stroke="${accent}" stroke-width="2" opacity="0.5"/>
      `);
    case "book-open":
      return g(`
        <path d="M -60 -30 Q -30 -40 0 -30 Q 30 -40 60 -30 L 60 40 Q 30 30 0 40 Q -30 30 -60 40 Z"
          fill="${main}"/>
        <line x1="0" y1="-30" x2="0" y2="40" stroke="${accent}" stroke-width="2"/>
        <g stroke="${accent}" stroke-width="1.5" opacity="0.55">
          <line x1="-50" y1="-15" x2="-15" y2="-20"/>
          <line x1="-50" y1="-5" x2="-15" y2="-10"/>
          <line x1="-50" y1="5" x2="-15" y2="0"/>
          <line x1="15" y1="-20" x2="50" y2="-15"/>
          <line x1="15" y1="-10" x2="50" y2="-5"/>
          <line x1="15" y1="0" x2="50" y2="5"/>
        </g>
      `);
    case "sparkle-mic":
      return g(`
        <rect x="-5" y="-5" width="10" height="55" rx="5" fill="${accent}"/>
        <ellipse cx="0" cy="-20" rx="20" ry="26" fill="${accent}"/>
        <rect x="-16" y="-6" width="32" height="6" rx="3" fill="${accent}"/>
        <g fill="${main}">
          <path d="M -35 -50 L -30 -40 L -20 -35 L -30 -30 L -35 -20 L -40 -30 L -50 -35 L -40 -40 Z"/>
          <path d="M 35 -40 L 40 -32 L 48 -28 L 40 -24 L 35 -16 L 30 -24 L 22 -28 L 30 -32 Z" opacity="0.85"/>
          <circle cx="-40" cy="10" r="3"/>
          <circle cx="45" cy="18" r="4"/>
        </g>
      `);
    case "cushion":
      return g(`
        <rect x="-55" y="-30" width="110" height="70" rx="18" fill="${main}"/>
        <circle cx="-55" cy="-30" r="8" fill="${accent}"/>
        <circle cx="55" cy="-30" r="8" fill="${accent}"/>
        <circle cx="-55" cy="40" r="8" fill="${accent}"/>
        <circle cx="55" cy="40" r="8" fill="${accent}"/>
        <path d="M -30 5 Q -15 -5 0 5 Q 15 15 30 5" stroke="${accent}" stroke-width="2.5" fill="none" opacity="0.6"/>
      `);
    case "podium":
      return g(`
        <path d="M -50 -20 L 50 -20 L 60 60 L -60 60 Z" fill="${main}"/>
        <rect x="-55" y="-25" width="110" height="12" rx="3" fill="${accent}"/>
        <line x1="-35" y1="10" x2="35" y2="10" stroke="${accent}" stroke-width="2" opacity="0.5"/>
        <line x1="-35" y1="25" x2="35" y2="25" stroke="${accent}" stroke-width="2" opacity="0.5"/>
        <line x1="-35" y1="40" x2="20" y2="40" stroke="${accent}" stroke-width="2" opacity="0.5"/>
      `);
    case "question-bubble":
      return g(`
        <path d="M -55 -35 Q -70 -35 -70 -15 L -70 25 Q -70 45 -50 45 L -25 45 L -20 60 L -10 45 L 55 45 Q 70 45 70 25 L 70 -15 Q 70 -35 55 -35 Z"
          fill="${main}" stroke="${accent}" stroke-width="3"/>
        <path d="M -14 -12 Q -14 -25 0 -25 Q 14 -25 14 -12 Q 14 0 0 5 L 0 15"
          stroke="${accent}" stroke-width="6" fill="none" stroke-linecap="round"/>
        <circle cx="0" cy="30" r="5" fill="${accent}"/>
      `);
    case "lightbulb":
      return g(`
        <path d="M -25 -15 Q -25 -55 0 -55 Q 25 -55 25 -15 Q 25 5 15 15 L 15 35 L -15 35 L -15 15 Q -25 5 -25 -15 Z"
          fill="${main}"/>
        <rect x="-14" y="35" width="28" height="8" fill="${accent}"/>
        <rect x="-10" y="43" width="20" height="6" fill="${accent}" opacity="0.7"/>
        <g stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity="0.75">
          <line x1="-42" y1="-30" x2="-32" y2="-25"/>
          <line x1="42" y1="-30" x2="32" y2="-25"/>
          <line x1="0" y1="-72" x2="0" y2="-62"/>
          <line x1="-30" y1="-58" x2="-24" y2="-50"/>
          <line x1="30" y1="-58" x2="24" y2="-50"/>
        </g>
      `);
    case "pompom":
      return g(`
        <circle cx="0" cy="-15" r="35" fill="${main}"/>
        <g fill="${accent}" opacity="0.6">
          <circle cx="-18" cy="-25" r="10"/>
          <circle cx="18" cy="-8" r="10"/>
          <circle cx="0" cy="0" r="9"/>
          <circle cx="-14" cy="0" r="7"/>
          <circle cx="14" cy="-22" r="8"/>
        </g>
        <rect x="-4" y="15" width="8" height="35" fill="${accent}"/>
      `);
    case "scroll":
      return g(`
        <rect x="-50" y="-10" width="100" height="55" rx="4" fill="${main}"/>
        <ellipse cx="-50" cy="17" rx="10" ry="30" fill="${accent}"/>
        <ellipse cx="50" cy="17" rx="10" ry="30" fill="${accent}"/>
        <g stroke="${accent}" stroke-width="1.5" opacity="0.55">
          <line x1="-38" y1="0" x2="38" y2="0"/>
          <line x1="-38" y1="12" x2="30" y2="12"/>
          <line x1="-38" y1="24" x2="38" y2="24"/>
          <line x1="-38" y1="36" x2="20" y2="36"/>
        </g>
      `);
  }
}

// --- Header / footer marks ---

function topMark(): string {
  return `<text x="${CX}" y="60" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif" letter-spacing="10"
    font-size="14" fill="#ffffff" opacity="0.65">ECHOID</text>`;
}

function bottomBadge(roleId: string, c: CharacterConfig): string {
  const label = roleId.replace(/_/g, " ").toUpperCase();
  return `
    <g transform="translate(${CX} 855)">
      <rect x="-160" y="-24" width="320" height="48" rx="24"
        fill="#ffffff" opacity="0.92"/>
      <text x="0" y="6" text-anchor="middle"
        font-family="Georgia, 'Times New Roman', serif" font-style="italic"
        font-size="20" fill="${c.decorColor}">${escapeXml(label)}</text>
    </g>
  `;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
