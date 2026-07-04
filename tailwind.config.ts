import type { Config } from "tailwindcss";

/**
 * VBTI · 声音照妖镜 design tokens.
 *
 * The palette is intentionally *anti-default*: no AI-purple gradient, no
 * cool neon blue, no Inter. Instead it's dark detective / archive noir —
 * rust red + copper on a warm deep dark. See docs/PRD-VBTI-v1.1.md and
 * the user-provided design brief.
 *
 * Dial values from the brief:
 *   DESIGN_VARIANCE = 9   (asymmetric layout, rotated cards, decorative junk)
 *   MOTION_INTENSITY = 7  (scan lines, waveforms, dramatic entrance)
 *   VISUAL_DENSITY = 6    (medium-high info per screen without crowding)
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ─── Deep background layers ─── */
        ink: "#1A1A1A",           // page background (near-black)
        cardDark: "#2A2520",       // dark card / blackboard
        cardDarker: "#3A3530",     // secondary container
        cardPaper: "#F5F0E8",      // aged paper
        cardPaperEdge: "#E8DFC9",  // torn / darker paper edge

        /* ─── Rust accents (single-accent lockdown) ─── */
        rust: "#C44B2F",           // primary accent
        rustWarm: "#D4654A",       // hover / gradient stop
        rustDeep: "#8B3A25",       // pressed / gradient dark stop

        /* ─── Copper / brass ─── */
        copper: "#E8B87A",         // border, badge outline
        copperDim: "#B8905A",      // darker copper for depth

        /* ─── Text hierarchy ─── */
        paper: "#F5F0E8",          // primary text on dark
        paperDim: "#C8C0B4",       // secondary text
        paperMuted: "#8A8278",     // tertiary / muted text
        inkText: "#1F1A15",        // primary text on aged paper

        /* ─── Semantic ─── */
        stamp: "#E74C3C",          // "已实锤" red stamp
        wave: "#4A90D9",           // acoustic waveform / analysis
        pass: "#5BBA6F",           // pass indicator (rarely used)

        /* ─── Legacy compatibility aliases so existing pages don't
             instantly break during migration. New code should not use
             these; they'll be pruned once the record/result rewrite lands.  */
        canvas: "#1A1A1A",
        surface: "#2A2520",
        surfaceHi: "#3A3530",
        line: "#3A3530",
        muted: "#C8C0B4",
        subtle: "#8A8278",
        accent: "#C44B2F",
        accent2: "#E8B87A",
      },
      fontFamily: {
        /* Display: 手写行楷. Ma Shan Zheng ships from Google Fonts and
         * reads as brushed calligraphy — great for the 判决书 title.  */
        display: ['"Ma Shan Zheng"', '"Noto Serif SC"', "serif"],
        /* Heading: heavy weight sans for the 判词.  */
        heading: ['"Noto Sans SC"', '"PingFang SC"', "system-ui", "sans-serif"],
        /* Body: normal-weight sans.  */
        sans: [
          '"Noto Sans SC"',
          '"PingFang SC"',
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        /* Mono: numeric-heavy stat readouts and Exhibit tags.  */
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["clamp(32px,8vw,48px)", { lineHeight: "1.1", letterSpacing: "0.05em" }],
        judgment: ["clamp(24px,6vw,36px)", { lineHeight: "1.15", letterSpacing: "0.02em" }],
        h2: ["clamp(18px,4.5vw,24px)", { lineHeight: "1.25" }],
        body: ["clamp(14px,3.5vw,16px)", { lineHeight: "1.6" }],
        data: ["clamp(16px,4vw,20px)", { lineHeight: "1.2" }],
        label: ["11px", { lineHeight: "1.2", letterSpacing: "0.1em" }],
      },
      spacing: {
        "safe-x": "18px",  // mobile horizontal safe area
      },
      boxShadow: {
        /* Physical, tactile shadows — not neon glows. */
        card: "2px 3px 8px rgba(0,0,0,0.4)",
        cardHover: "3px 4px 12px rgba(0,0,0,0.5)",
        panel: "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.4)",
        rivet: "inset 0 1px 2px rgba(0,0,0,0.6), 0 1px 1px rgba(255,255,255,0.08)",
        stampSoft: "0 2px 4px rgba(0,0,0,0.3)",
        rustBtn: "0 2px 0 #6a2a17, inset 0 1px 0 rgba(255,255,255,0.15)",
      },
      borderRadius: {
        sharp: "2px",
        DEFAULT: "4px",
        card: "8px",
      },
      backgroundImage: {
        /* Rust metal gradient for CTA buttons. */
        rustBtn:
          "linear-gradient(180deg, #D4654A 0%, #C44B2F 55%, #8B3A25 100%)",
        rustBtnHover:
          "linear-gradient(180deg, #E27A5D 0%, #D4654A 55%, #9A4229 100%)",
        /* Copper trim used as thin border-image on tags. */
        copperTrim:
          "linear-gradient(90deg, #B8905A 0%, #E8B87A 50%, #B8905A 100%)",
        /* Top-right spotlight cone. */
        spotlight:
          "radial-gradient(circle at 82% 8%, rgba(232,184,122,0.22) 0%, rgba(232,184,122,0.06) 30%, transparent 55%)",
      },
      animation: {
        "scan-line": "scan-line 3s linear infinite",
        "lamp-pulse": "lamp-pulse 2.6s ease-in-out infinite",
        "waveform-1": "waveform 0.9s ease-in-out infinite",
        "waveform-2": "waveform 1.1s ease-in-out infinite 0.15s",
        "waveform-3": "waveform 1.3s ease-in-out infinite 0.3s",
        "count-up": "count-up 800ms cubic-bezier(0.23,1,0.32,1) both",
        "stamp-drop": "stamp-drop 400ms cubic-bezier(0.34,1.56,0.64,1) both",
        "fade-up": "fade-up 500ms cubic-bezier(0.23,1,0.32,1) both",
        "grain-shift": "grain-shift 8s steps(6) infinite",
      },
      keyframes: {
        "scan-line": {
          "0%": { transform: "translateY(-10%)", opacity: "0.0" },
          "10%": { opacity: "0.85" },
          "90%": { opacity: "0.85" },
          "100%": { transform: "translateY(110%)", opacity: "0" },
        },
        "lamp-pulse": {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "0.95" },
        },
        waveform: {
          "0%,100%": { transform: "scaleY(0.28)" },
          "50%": { transform: "scaleY(1.0)" },
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(6px) scale(0.96)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "stamp-drop": {
          "0%": { opacity: "0", transform: "rotate(-24deg) scale(1.6)" },
          "60%": { opacity: "0.95", transform: "rotate(-9deg) scale(0.94)" },
          "100%": { opacity: "0.85", transform: "rotate(-12deg) scale(1)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "grain-shift": {
          "0%": { transform: "translate(0,0)" },
          "20%": { transform: "translate(-2%,1%)" },
          "40%": { transform: "translate(1%,-1%)" },
          "60%": { transform: "translate(-1%,2%)" },
          "80%": { transform: "translate(2%,-2%)" },
          "100%": { transform: "translate(0,0)" },
        },
      },
      transitionTimingFunction: {
        "out-strong": "cubic-bezier(0.23,1,0.32,1)",
      },
    },
  },
  plugins: [],
};

export default config;
