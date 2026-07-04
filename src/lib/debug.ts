"use client";

/**
 * Debug-mode helpers.
 *
 * Debug mode defaults to ON for dev/preview. It can be turned off by visiting
 * any page with ?debug=0 (persists in localStorage) or by clicking the × in
 * the overlay. ?debug=1 explicitly re-enables it.
 *
 * A tiny React hook exposes the current flag. It's SSR-safe: on the server
 * it always returns false and rehydrates on mount.
 */
import { useEffect, useState } from "react";

const KEY = "echoid_debug";
// Sentinel values written to localStorage:
//   "1"  → explicitly on
//   "0"  → explicitly off
//   (unset) → follow DEFAULT_ON
const DEFAULT_ON = true;

export function useDebugMode(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const q = url.searchParams.get("debug");
    if (q === "1") {
      window.localStorage.setItem(KEY, "1");
    } else if (q === "0") {
      window.localStorage.setItem(KEY, "0");
    }
    const stored = window.localStorage.getItem(KEY);
    setOn(stored === null ? DEFAULT_ON : stored === "1");

    // Cross-tab sync.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        setOn(e.newValue === null ? DEFAULT_ON : e.newValue === "1");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return on;
}

export function setDebugMode(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, on ? "1" : "0");
}
