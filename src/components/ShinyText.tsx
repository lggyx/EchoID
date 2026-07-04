/**
 * ShinyText — a subtle "light sweep" travelling across the text.
 * Reactbits.dev has a similar component; this is a lightweight CSS-only take.
 *
 * Base color is muted; a bright band scans across via a masked gradient.
 */
import type { ReactNode } from "react";

export default function ShinyText({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block text-transparent bg-clip-text bg-[linear-gradient(110deg,rgba(245,241,255,0.35)_35%,rgba(255,255,255,1)_50%,rgba(245,241,255,0.35)_65%)] bg-[length:200%_100%] animate-shine ${className}`}
    >
      {children}
    </span>
  );
}
