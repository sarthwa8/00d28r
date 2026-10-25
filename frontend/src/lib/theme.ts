import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "windsight-theme";

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null; // private mode / blocked storage: fall back to the OS setting
  }
}

/** Follows the OS until the viewer picks a theme; the pick is stamped on <html data-theme> so CSS tokens switch. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* preference just won't persist */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
