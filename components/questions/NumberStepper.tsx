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
import { ONSET_MIN } from "@/lib/patient";
import { t, type Lang } from "@/lib/i18n";

/**
 * `low` is the first age in the band, and it is what decides whether the card is
 * available: a 25-year-old cannot have started losing hair in their 30s.
 */
const PRESETS = [
  { label: "onsetTeens", hint: "onsetTeensHint", value: 16, low: 13 },
  { label: "onset20s", hint: "onset20sHint", value: 25, low: 20 },
  { label: "onset30s", hint: "onset30sHint", value: 35, low: 30 },
  { label: "onset40s", hint: "onset40sHint", value: 45, low: 40 },
  { label: "onset50s", hint: "onset50sHint", value: 55, low: 50 },
] as const;

/*
  Reads its floor from lib/patient.ts rather than declaring one.

  It was a local `5` while the age field accepted 1, and a local constant beside a shared one
  is a second source of truth waiting to disagree: raising the age floor to 16 would have left
  this offering 5, 6, 7 for an onset age.
*/
const MIN = ONSET_MIN;
const DEFAULT_MAX = 90;

export function NumberStepper({
  value,
  lang,
  max = DEFAULT_MAX,
  onChange,
}: {
  lang: Lang;
  value: number | null;
  /**
   * Upper bound, which is the patient's own age once they have given it.
   *
   * Not cosmetic: without it a 45-year-old can slide this to 60 and the doctor receives
   * "hair loss began at 60" as a fact.
   *
   * The decade cards obey it too, and until recently they did not - the comment here
   * claimed they were filtered when in truth tapping "50+" at 25 clamped silently to 25,
   * which looks exactly like the app ignoring the tap. They are now shown, greyed and
   * unpressable, with one line underneath saying why. Shown rather than removed so the
   * grid does not reshuffle under the patient's thumb as their age changes.
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
      <div>
        <div className="grid grid-cols-3 gap-2.5">
          {PRESETS.map((p) => {
            const active = value !== null && nearest(value, max) === p.value;
            const label = t(p.label, lang);
            // A band the patient cannot have lived through yet.
            const blocked = p.low > max;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                aria-disabled={blocked}
                aria-describedby={blocked ? "onset-bound" : undefined}
                onClick={
                  blocked
                    ? undefined
                    : () => {
                        set(p.value);
                        setFine(true);
                      }
                }
                className={cn(
                  "flex min-h-[72px] flex-col items-center justify-center rounded-2xl border-2",
                  "transition-all duration-100",
                  blocked
                    ? "cursor-not-allowed border-dashed border-line bg-card/50"
                    : active
                      ? "border-brand bg-brand-soft active:scale-[0.98]"
                      : "border-line bg-card hover:border-brand/50 hover:bg-brand-soft/35 active:scale-[0.98]",
                )}
              >
                <span
                  className={cn(
                    "text-[15px] font-bold",
                    blocked ? "text-muted/70" : active ? "text-brand-ink" : "text-ink",
                  )}
                >
                  {label}
                </span>
                <span
                  className={cn("mt-0.5 text-[11px]", blocked ? "text-muted/60" : "text-muted")}
                >
                  {blocked ? t("onsetClosed", lang) : t(p.hint, lang)}
                </span>
              </button>
            );
          })}
        </div>
        {/* One explanation for the whole grid, rather than five repetitions of it. */}
        {PRESETS.some((p) => p.low > max) ? (
          <p id="onset-bound" className="mt-2.5 text-[12.5px] leading-snug text-muted">
            {t("onsetBound", lang, { age: max })}
          </p>
        ) : null}
      </div>

      {fine ? (
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="text-center text-[13px] text-muted">{t("onsetFine", lang)}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <StepBtn label={t("onsetDown", lang)} onClick={() => set((value ?? 25) - 1)}>
              −
            </StepBtn>
            <div className="text-center">
              <span className="block text-[40px] font-bold leading-none tabular-nums text-brand-ink">
                {value ?? " - "}
              </span>
              <span className="mt-1 block text-[12px] text-muted">{t("onsetYears", lang)}</span>
            </div>
            <StepBtn label={t("onsetUp", lang)} onClick={() => set((value ?? 25) + 1)}>
              +
            </StepBtn>
          </div>
          {/* A range slider is the fastest way to move 10+ years with one thumb. */}
          <input
            type="range"
            min={MIN}
            max={max}
            value={value ?? 25}
            aria-label={t("onsetAria", lang)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="mt-4 h-11 w-full accent-[var(--color-brand)]"
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Which card to highlight for a value - considering only cards the patient can pick.
 *
 * Without the bound, a 25-year-old whose answer is 25 could light up a card that is
 * greyed out, which reads as the form contradicting itself.
 */
function nearest(v: number, max: number): number {
  const usable = PRESETS.filter((p) => p.low <= max);
  const pool = usable.length > 0 ? usable : PRESETS;
  return pool.reduce((best, p) =>
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
