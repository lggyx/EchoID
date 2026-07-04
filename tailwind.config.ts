import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette inspired by reactbits.dev — deep violet-black canvas,
        // near-white text, iridescent accents.
        canvas: "#120F17",
        surface: "#1A1622",
        surfaceHi: "#221C2E",
        line: "#2A2438",
        ink: "#F5F1FF",
        muted: "#8B839F",
        subtle: "#5B5470",
        // Two accents used for gradients / glows.
        accent: "#B37CFF",
        accent2: "#5EE7FF",
        // Legacy aliases so any lingering utility classes don't break — they
        // now resolve to the dark theme equivalents.
        paper: "#120F17",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        sans: [
          '"Bricolage Grotesque"',
          '"Noto Sans SC"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"PingFang SC"',
          "system-ui",
          "sans-serif",
        ],
        mono: ['"Google Sans Code"', "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "grad-primary":
          "linear-gradient(135deg, #B37CFF 0%, #5EE7FF 60%, #FFA1E0 100%)",
        "grad-soft":
          "linear-gradient(180deg, rgba(179,124,255,0.18) 0%, rgba(94,231,255,0.06) 60%, rgba(255,161,224,0) 100%)",
      },
      boxShadow: {
        glow: "0 0 40px rgba(179,124,255,0.35), 0 0 80px rgba(94,231,255,0.15)",
        glowSoft: "0 0 24px rgba(179,124,255,0.25)",
      },
      animation: {
        "gradient-shift": "gradient-shift 6s ease-in-out infinite",
        "shine": "shine 3.5s linear infinite",
        "breathe": "breathe 3.2s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-up": "fade-up 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "orb-drift": "orb-drift 14s ease-in-out infinite",
      },
      keyframes: {
        "gradient-shift": {
          "0%,100%": { "background-position": "0% 50%" },
          "50%": { "background-position": "100% 50%" },
        },
        shine: {
          "0%": { "background-position": "-200% 0" },
          "100%": { "background-position": "200% 0" },
        },
        breathe: {
          "0%,100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.06)", opacity: "0.92" },
        },
        "pulse-glow": {
          "0%,100%": { "box-shadow": "0 0 24px rgba(179,124,255,0.35)" },
          "50%": { "box-shadow": "0 0 48px rgba(179,124,255,0.6)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "orb-drift": {
          "0%,100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(20px,-30px,0) scale(1.08)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
