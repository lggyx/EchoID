/**
 * A text component that renders itself with a moving iridescent gradient.
 * Inspired by reactbits.dev's GradientText. Pure CSS — no framer-motion.
 */
import type { ReactNode } from "react";

export default function GradientText({
  children,
  className = "",
  as: Tag = "span",
}: {
  children: ReactNode;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}) {
  return (
    <Tag
      className={`bg-clip-text text-transparent bg-[length:200%_200%] animate-gradient-shift bg-grad-primary ${className}`}
    >
      {children}
    </Tag>
  );
}
