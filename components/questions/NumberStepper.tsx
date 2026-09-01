"use client";

/**
 * Q1 age hair loss began.
 *
 * "At what age did it start?" is a memory question, not a data-entry question - most
 * patients know the decade, not the year. So the coarse control comes first (five
 * decade presets), and the fine control appears only after a preset is picked.
 * That turns a keyboard interaction into one tap plus an optional nudge, and it
 * avoids the classic mobile number-input trap of a 3-key numeric keypad popping up
 * over the form.
 */
import { useState } from "react";
import { cn, tick } from "@/lib/utils";

const PRESETS = [
  { label: "Teens", hint: "13-19", value: 16 },
  { label: "20s", hint: "20-29", value: 25 },
  { label: "30s", hint: "30-39", value: 35 },
  { label: "40s", hint: "40-49", value: 45 },
  { label: "50+", hint: "50 or later", value: 55 },
] as const;

const MIN = 5;
const DEFAULT_MAX = 90;

export function NumberStepper({
  value,
  max = DEFAULT_MAX,
  onChange,
}: {
  value: number | null;
  /**
   * Upper bound, which is the patient's own age once they have given it.
   *
   * Not cosmetic: without it a 45-year-old can slide this to 60 and the doctor receives
   * "hair loss began at 60" as a fact. The presets above the slider are filtered by it
   * too, so an impossible decade is never offered in the first place.
   */
  max?: number;
  onChange: (v: number) => void;
}) {
  // Fine-tune is revealed after the first coarse pick, or immediately on a resumed answer.
  const [fine, setFine] = useState(value !== null);

  function set(v: number) {
    tick();
    onChange(Math.min(max, Math.max(MIN, v)));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-2.5">
        {PRESETS.map((p) => {
          const active = value !== null && nearest(value) === p.value;
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                set(p.value);
                setFine(true);
              }}
              className={cn(
                "flex min-h-[72px] flex-col items-center justify-center rounded-2xl border-2",
                "transition-all duration-100 active:scale-[0.98]",
                active
                  ? "border-brand bg-brand-soft"
                  : "border-line bg-card hover:border-brand/50 hover:bg-brand-soft/35",
              )}
            >
              <span
                className={cn(
                  "text-[15px] font-bold",
                  active ? "text-brand-ink" : "text-ink",
                )}
              >
                {p.label}
              </span>
              <span className="mt-0.5 text-[11px] text-muted">{p.hint}</span>
            </button>
          );
        })}
      </div>

      {fine ? (
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="text-center text-[13px] text-muted">Fine-tune it</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <StepBtn label="Decrease age" onClick={() => set((value ?? 25) - 1)}>
              −
            </StepBtn>
            <div className="text-center">
              <span className="block text-[40px] font-bold leading-none tabular-nums text-brand-ink">
                {value ?? " - "}
              </span>
              <span className="mt-1 block text-[12px] text-muted">years old</span>
            </div>
            <StepBtn label="Increase age" onClick={() => set((value ?? 25) + 1)}>
              +
            </StepBtn>
          </div>
          {/* A range slider is the fastest way to move 10+ years with one thumb. */}
          <input
            type="range"
            min={MIN}
            max={max}
            value={value ?? 25}
            aria-label="Age hair loss began"
            onChange={(e) => onChange(Number(e.target.value))}
            className="mt-4 h-11 w-full accent-[var(--color-brand)]"
          />
        </div>
      ) : null}
    </div>
  );
}

function nearest(v: number): number {
  return PRESETS.reduce((best, p) =>
    Math.abs(p.value - v) < Math.abs(best.value - v) ? p : best,
  ).value;
}

function StepBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-14 shrink-0 place-items-center rounded-2xl border-2 border-line bg-paper text-2xl font-bold text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-ink active:scale-95"
    >
      {children}
    </button>
  );
}
