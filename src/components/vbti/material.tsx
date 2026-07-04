/**
 * Reusable VBTI material components. All child pages import from here.
 *
 * Naming convention:
 *   AgedCard      — cream-paper block with grain, torn edges, rotation.
 *   Blackboard    — dark panel with rivets, used for stat readouts.
 *   ExhibitTag    — small copper-outlined mono label (Exhibit A / B / C).
 *   Stamp         — red rotated stamp ("已实锤" / "取证中" etc).
 *   StatBar       — horizontal rust-gradient progress bar with value.
 *   ScanLine      — animated horizontal scan line for "analyzing" state.
 *   Rivet         — decorative corner rivet, positioned inside Blackboard.
 *   CaseId        — mono uppercase pill ("CASE FILE Nº 04").
 *   ChainDivider  — bottom decorative chain across the page.
 *   RustButton    — primary CTA button; polymorphic (as="a" or "button").
 *   CopperButton  — secondary uppercase mono button.
 */
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode, CSSProperties } from "react";

/* ────────── AgedCard ────────── */

export function AgedCard({
  children,
  className = "",
  rotate = 0,
  pin,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** Rotation in degrees applied to the whole card (e.g. -2, 1.5). */
  rotate?: number;
  /** Optional decorative pin/clip in the top corner. */
  pin?: "left" | "right" | "none";
  style?: CSSProperties;
}) {
  return (
    <div
      className={`aged-paper relative px-5 py-5 ${className}`}
      style={{
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        ...style,
      }}
    >
      {pin === "left" && <PaperClip position="left" />}
      {pin === "right" && <PaperClip position="right" />}
      <div className="relative">{children}</div>
    </div>
  );
}

function PaperClip({ position }: { position: "left" | "right" }) {
  const side = position === "left" ? "left-3" : "right-3";
  return (
    <div
      className={`absolute -top-3 ${side} w-10 h-6 rounded-sm rotate-[-6deg] pointer-events-none`}
      style={{
        background:
          "linear-gradient(180deg, rgba(232,184,122,0.55) 0%, rgba(184,144,90,0.45) 100%)",
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
      }}
      aria-hidden
    />
  );
}

/* ────────── Blackboard ────────── */

export function Blackboard({
  children,
  className = "",
  rivets = true,
  title,
}: {
  children: ReactNode;
  className?: string;
  rivets?: boolean;
  title?: string;
}) {
  return (
    <div className={`blackboard relative px-4 py-4 ${className}`}>
      {rivets && (
        <>
          <span className="rivet top-2 left-2" aria-hidden />
          <span className="rivet top-2 right-2" aria-hidden />
          <span className="rivet bottom-2 left-2" aria-hidden />
          <span className="rivet bottom-2 right-2" aria-hidden />
        </>
      )}
      {title && (
        <div className="font-mono text-[11px] tracking-[0.25em] text-copper uppercase mb-3">
          ▸ {title}
        </div>
      )}
      {children}
    </div>
  );
}

/* ────────── ExhibitTag ────────── */

export function ExhibitTag({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center border border-copper text-copper font-mono text-[10px] tracking-[0.15em] uppercase px-2 py-[3px] bg-cardDark ${className}`}
    >
      {label}
    </span>
  );
}

/* ────────── Stamp ────────── */

export function Stamp({
  text,
  color = "#E74C3C",
  size = "md",
  className = "",
  rotate = -12,
  drop = true,
}: {
  text: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  rotate?: number;
  className?: string;
  drop?: boolean;
}) {
  const sizes: Record<string, string> = {
    sm: "text-[12px] px-2 py-[2px] border-2",
    md: "text-[15px] px-3 py-[4px] border-[3px]",
    lg: "text-[20px] px-4 py-[6px] border-[4px]",
  };
  return (
    <span
      className={`inline-block font-heading font-black tracking-[0.15em] ${sizes[size]} ${
        drop ? "animate-stamp-drop" : ""
      } ${className}`}
      style={{
        color,
        borderColor: color,
        opacity: 0.88,
        transform: `rotate(${rotate}deg)`,
        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        borderRadius: "3px",
      }}
    >
      {text}
    </span>
  );
}

/* ────────── StatBar ────────── */

export function StatBar({
  label,
  value,
  outOf = 100,
  animate = true,
}: {
  label: string;
  value: number;
  outOf?: number;
  /** Whether to run the sweep-in animation on mount. */
  animate?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, (value / outOf) * 100));
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-paper text-[13px]">{label}</span>
          <span className="font-mono text-rust font-bold text-data tabular-nums">
            {Math.round(value)}
            <span className="text-paperDim/70 font-normal text-[11px]">
              /{outOf}
            </span>
          </span>
        </div>
        <div
          className="relative w-full h-2 rounded-sharp overflow-hidden"
          style={{
            background: "#1e1a15",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
          }}
        >
          <div
            className="h-full rounded-sharp"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #C44B2F 0%, #D4654A 100%)",
              transition: animate
                ? "width 800ms cubic-bezier(0.23,1,0.32,1)"
                : undefined,
              boxShadow: "0 0 6px rgba(196,75,47,0.4)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ────────── ScanLine ────────── */

export function ScanLine({ visible = true }: { visible?: boolean }) {
  if (!visible) return null;
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 pointer-events-none z-10 overflow-hidden h-full"
    >
      <div
        className="animate-scan-line"
        style={{
          height: "40px",
          background:
            "linear-gradient(180deg, transparent 0%, rgba(74,144,217,0.28) 45%, rgba(74,144,217,0.85) 50%, rgba(74,144,217,0.28) 55%, transparent 100%)",
          filter: "blur(0.5px)",
        }}
      />
    </div>
  );
}

/* ────────── CaseId ────────── */

export function CaseId({
  n,
  label = "案发现场",
  className = "",
}: {
  n: string;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.35em] text-copperDim uppercase ${className}`}
    >
      <span className="w-3 h-px bg-copperDim" />
      <span>{label}</span>
      <span className="text-copper">Nº {n}</span>
      <span className="w-3 h-px bg-copperDim" />
    </span>
  );
}

/* ────────── ChainDivider ────────── */

export function ChainDivider() {
  return (
    <div className="w-full flex items-center justify-center py-4" aria-hidden>
      <svg
        viewBox="0 0 320 20"
        className="w-full max-w-[420px] h-4 opacity-45"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="chainG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E8B87A" />
            <stop offset="50%" stopColor="#B8905A" />
            <stop offset="100%" stopColor="#7A5C33" />
          </linearGradient>
        </defs>
        {Array.from({ length: 16 }).map((_, i) => (
          <ellipse
            key={i}
            cx={12 + i * 20}
            cy={10}
            rx={9}
            ry={5}
            fill="none"
            stroke="url(#chainG)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
    </div>
  );
}

/* ────────── Buttons ────────── */

type RustButtonProps =
  | ({ as?: "button" } & ButtonHTMLAttributes<HTMLButtonElement>)
  | ({ as: "a" } & AnchorHTMLAttributes<HTMLAnchorElement>);

export function RustButton(props: RustButtonProps) {
  const { className = "", children, ...rest } = props as RustButtonProps & {
    className?: string;
    children?: ReactNode;
  };
  const merged = `rust-btn font-heading ${className}`;
  if ((props as { as?: string }).as === "a") {
    const p = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a {...p} className={merged}>
        {children}
      </a>
    );
  }
  const p = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button {...p} className={merged}>
      {children}
    </button>
  );
}

type CopperButtonProps =
  | ({ as?: "button" } & ButtonHTMLAttributes<HTMLButtonElement>)
  | ({ as: "a" } & AnchorHTMLAttributes<HTMLAnchorElement>);

export function CopperButton(props: CopperButtonProps) {
  const { className = "", children, ...rest } = props as CopperButtonProps & {
    className?: string;
    children?: ReactNode;
  };
  const merged = `copper-btn ${className}`;
  if ((props as { as?: string }).as === "a") {
    const p = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a {...p} className={merged}>
        {children}
      </a>
    );
  }
  const p = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button {...p} className={merged}>
      {children}
    </button>
  );
}
