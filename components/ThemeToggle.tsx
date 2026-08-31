"use client";

/**
 * Light / dark toggle.
 *
 * Three states rather than two: "system" is the default and follows the phone, because
 * a clinic tablet set to dark at 9pm should open dark without anyone touching a setting.
 * Tapping cycles system -> light -> dark, and an explicit choice always wins over the
 * media query (see the `:root[data-theme]` rules in globals.css).
 *
 * The choice is written to `localStorage` (not sessionStorage like the answers) because
 * a display preference is not patient data - and it is re-applied by the inline script
 * in layout.tsx before first paint, so there is no flash of the wrong theme.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Theme = "system" | "light" | "dark";
const KEY = "genoroot-theme";
const ORDER: Theme[] = ["system", "light", "dark"];

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* private mode - the theme still applies for this session */
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  // Starts as null so the button renders nothing until mounted; reading the DOM during
  // render would disagree with the server HTML and trip hydration.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem(KEY) as Theme | null;
      } catch {
        return null;
      }
    })();
    setTheme(stored === "light" || stored === "dark" ? stored : "system");
  }, []);

  if (theme === null) {
    // Reserve the exact footprint so the header does not shift when it appears.
    return <span aria-hidden className={cn("block size-9", className)} />;
  }

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;

  return (
    <button
      type="button"
      onClick={() => {
        apply(next);
        setTheme(next);
      }}
      aria-label={`Appearance: ${theme}. Switch to ${next}.`}
      title={`Appearance: ${theme}`}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full border border-line bg-card",
        "text-muted transition-colors hover:border-brand/50 hover:text-brand-ink active:scale-95",
        className,
      )}
    >
      {theme === "system" ? <SystemIcon /> : theme === "light" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden {...stroke}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden {...stroke}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

/** Half-filled circle: the conventional "follow the device" glyph. */
function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden {...stroke}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
