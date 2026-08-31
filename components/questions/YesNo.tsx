"use client";

/**
 * Q8, Q9 — two big side-by-side buttons, thumb-reachable, auto-advancing.
 * Also reused inside the habits and products grids as a compact inline pair.
 */
import { useEffect, useState } from "react";
import { cn, tick } from "@/lib/utils";
import { UI_COPY } from "@/lib/copy";

export function YesNo({
  value,
  onChange,
  onAdvance,
  size = "lg",
  yesLabel = UI_COPY.yes,
  noLabel = UI_COPY.no,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  onAdvance?: () => void;
  size?: "lg" | "sm";
  yesLabel?: string;
  noLabel?: string;
}) {
  const [pending, setPending] = useState<boolean | null>(null);

  useEffect(() => {
    if (pending === null || !onAdvance) return;
    const t = setTimeout(onAdvance, 180);
    return () => clearTimeout(t);
  }, [pending, onAdvance]);

  const shown = pending ?? value;

  return (
    <div role="radiogroup" className={cn("grid grid-cols-2", size === "lg" ? "gap-3" : "gap-2")}>
      {[
        { v: true, label: yesLabel },
        { v: false, label: noLabel },
      ].map(({ v, label }) => (
        <button
          key={label}
          type="button"
          role="radio"
          aria-checked={shown === v}
          onClick={() => {
            tick();
            onChange(v);
            setPending(v);
          }}
          className={cn(
            "rounded-2xl border-2 font-semibold transition-all duration-100 active:scale-[0.98]",
            size === "lg" ? "min-h-[88px] text-lg" : "min-h-[44px] px-3 text-[13px]",
            shown === v
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-line bg-card text-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
