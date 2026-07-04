/**
 * GradientBg — decorative animated background used behind hero/reveal sections.
 * Three blurred, drifting color orbs on top of a dotted grid; positioned
 * absolute inside the parent so it fills whatever container it's placed in.
 *
 * Pointer events are disabled so it doesn't interfere with content on top.
 */
export default function GradientBg({
  intensity = "normal",
  className = "",
}: {
  /** Higher = brighter orbs (used on the reveal moment). */
  intensity?: "soft" | "normal" | "high";
  className?: string;
}) {
  const opacity =
    intensity === "high" ? "opacity-90" : intensity === "soft" ? "opacity-40" : "opacity-70";
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 bg-dots opacity-40" />
      <div
        className={`absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full blur-3xl ${opacity} animate-orb-drift`}
        style={{
          background:
            "radial-gradient(circle, rgba(179,124,255,0.55) 0%, rgba(179,124,255,0) 70%)",
        }}
      />
      <div
        className={`absolute top-1/3 -right-32 w-[460px] h-[460px] rounded-full blur-3xl ${opacity} animate-orb-drift`}
        style={{
          background:
            "radial-gradient(circle, rgba(94,231,255,0.45) 0%, rgba(94,231,255,0) 70%)",
          animationDelay: "-3s",
        }}
      />
      <div
        className={`absolute bottom-0 left-1/3 w-[380px] h-[380px] rounded-full blur-3xl ${opacity} animate-orb-drift`}
        style={{
          background:
            "radial-gradient(circle, rgba(255,161,224,0.35) 0%, rgba(255,161,224,0) 70%)",
          animationDelay: "-7s",
        }}
      />
    </div>
  );
}
