"use client";

/**
 * Q8, Q9 - two big side-by-side buttons, thumb-reachable.
 * Also reused inside the habits and products grids as a compact inline pair.
 *
 * No longer auto-advancing: see the note in SingleChoice. A yes/no is the easiest control
 * in the form to hit by accident, which makes it the worst one to let move the screen on.
 */
import { cn, tick } from "@/lib/utils";
import { ui, type Lang } from "@/lib/i18n";

export function YesNo({
  value,
  onChange,
  lang,
  size = "lg",
  yesLabel,
  noLabel,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  lang: Lang;
  size?: "lg" | "sm";
  /** Overrides for the grids ("I use this"); default to plain yes / no. */
  yesLabel?: string;
  noLabel?: string;
}) {
  const yes = yesLabel ?? ui(lang).yes;
  const no = noLabel ?? ui(lang).no;
  const shown = value;

  return (
    /*
      Two layouts, because the two sizes answer different questions.

      `lg` is a question all by itself, so its pair fills the width - a 2x1 grid of big
      targets. `sm` sits in a table row inside a shared 420px control column, and a grid
      there would stretch "Yes" and "No" to 206px each: two enormous buttons saying two
      short words, and a left edge that no longer matches the option rows above and below
      it. So the small pair is a flex row of fixed-width buttons, packed to the left.
    */
    <div
      role="radiogroup"
      className={cn(
        size === "lg" ? "grid grid-cols-2 gap-3" : "flex justify-start gap-2",
      )}
    >
      {[
        { v: true, label: yes },
        { v: false, label: no },
      ].map(({ v, label }) => (
        <button
          key={label}
          type="button"
          role="radio"
          aria-checked={shown === v}
          onClick={() => {
            tick();
            onChange(v);
          }}
          className={cn(
            "rounded-2xl border-2 font-semibold transition-all duration-100 active:scale-[0.98]",
            // tap-lg shrinks under `pointer: fine`; the 88px stays for thumbs.
            size === "lg"
              ? "tap-lg min-h-[88px] text-lg"
              : "min-h-[44px] w-[84px] shrink-0 px-3 text-[13px]",
            shown === v
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-line bg-card text-muted hover:border-brand/50 hover:bg-brand-soft/40 hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
