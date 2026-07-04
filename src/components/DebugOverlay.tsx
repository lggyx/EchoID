"use client";

/**
 * Right-top floating debug overlay.
 *
 * Renders nothing unless debug mode is on (see useDebugMode). The overlay is
 * collapsible via a header click; when collapsed it shrinks to a small
 * "DEBUG" pill so it doesn't cover UI.
 *
 * Contents are opaque to this component — callers pass an array of sections,
 * each with a title and either scalar rows (label/value) or a raw JSON blob.
 */
import { useState, type ReactNode } from "react";
import { setDebugMode, useDebugMode } from "@/lib/debug";

export type DebugRow = [label: string, value: string | number];

export interface DebugSection {
  title: string;
  rows?: DebugRow[];
  json?: unknown;
  /** Optional custom node rendered below rows/json. */
  extra?: ReactNode;
}

export default function DebugOverlay({ sections }: { sections: DebugSection[] }) {
  const debug = useDebugMode();
  const [open, setOpen] = useState(true);

  if (!debug) return null;

  return (
    <div
      className="fixed top-2 right-2 z-[9999] max-w-[min(360px,calc(100vw-16px))] rounded-lg bg-black/85 text-[11px] text-emerald-300 font-mono shadow-xl backdrop-blur-sm select-text"
      style={{ fontFeatureSettings: "'tnum' 1" }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tracking-[0.2em] text-white/80">DEBUG</span>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDebugMode(false);
              // Nudge react — the hook listens to storage events cross-tab,
              // but for same-tab we reload to reset any live subscribers.
              window.location.reload();
            }}
            className="text-white/50 hover:text-white/90"
            title="关闭 debug 模式"
          >
            ×
          </button>
          <span className="text-white/50">{open ? "▾" : "▸"}</span>
        </div>
      </div>
      {open && (
        <div className="max-h-[70vh] overflow-y-auto p-2 flex flex-col gap-2">
          {sections.map((s, i) => (
            <section key={i} className="flex flex-col gap-1">
              <div className="text-[10px] text-white/50 tracking-wider uppercase px-1">
                {s.title}
              </div>
              {s.rows && s.rows.length > 0 && (
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-1">
                  {s.rows.map(([k, v], j) => (
                    <RowKV key={j} k={k} v={v} />
                  ))}
                </div>
              )}
              {s.json !== undefined && (
                <pre className="whitespace-pre-wrap break-all bg-white/5 rounded px-2 py-1 text-[10px] leading-tight text-emerald-200/90">
                  {JSON.stringify(s.json, null, 2)}
                </pre>
              )}
              {s.extra}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function RowKV({ k, v }: { k: string; v: string | number }) {
  const s =
    typeof v === "number"
      ? Number.isInteger(v)
        ? v.toString()
        : v.toFixed(3)
      : v;
  return (
    <>
      <span className="text-white/60">{k}</span>
      <span className="text-emerald-300 tabular-nums text-right">{s}</span>
    </>
  );
}
