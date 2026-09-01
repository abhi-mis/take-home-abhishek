"use client";

/**
 * The first screen: who is filling this in.
 *
 * Three inputs, and every one of them earns its place by changing the rest of the form:
 *
 *   name (optional)  the form stops sounding like a form. Never leaves the device.
 *   sex              gates Q6/Q7, and is emitted so the doctor sees why they are null.
 *   age              sets the text and tap-target size, caps the onset age at Q1, and
 *                    turns the Q6/Q7 suggestions into something honest.
 *
 * The design job here is to make that visible while it happens. Asking a stranger for
 * their age with no explanation is intrusive; asking for it and then watching the screen
 * get larger in front of you is obviously in your interest. So the comfort preview is
 * live and sits directly under the age control - the customisation is not a promise about
 * later, it is the thing you just did.
 *
 * The age control is coarse-then-fine, like Q1: five decade cards get you within ten
 * years in one tap, and the slider that appears afterwards is for the exact number. That
 * ordering exists because "how old are you" is instant recall while a numeric keypad on a
 * phone is not, and because a 68-year-old should never have to hit a small target.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { t, ui, type Lang } from "@/lib/i18n";
import {
  AGE_MAX,
  AGE_MIN,
  cleanFirstName,
  comfortName,
  nameAck,
  suggestedComfort,
  type Comfort,
} from "@/lib/patient";
import type { PatientSex } from "@/lib/types";
import type { TextKey } from "@/lib/copy.hi";
import { cn, tick } from "@/lib/utils";
import { CheckIcon } from "../ui/Button";

const SEX_OPTIONS: { value: PatientSex; label: TextKey; gloss: TextKey }[] = [
  { value: "female", label: "aboutSexFemale", gloss: "aboutSexTwoApply" },
  { value: "male", label: "aboutSexMale", gloss: "aboutSexTwoSkipped" },
  { value: "prefer_not", label: "aboutSexPreferNot", gloss: "aboutSexTwoSkipped" },
];

const AGE_BANDS = [
  { label: "16-24", value: 21 },
  { label: "25-34", value: 30 },
  { label: "35-44", value: 40 },
  { label: "45-54", value: 50 },
  { label: "55-64", value: 60 },
  { label: "65+", value: 70 },
] as const;

export function AboutYou({
  firstName,
  sex,
  age,
  comfort,
  comfortAsked,
  lang,
  onFirstName,
  onSex,
  onAge,
}: {
  lang: Lang;
  firstName: string | null;
  sex: PatientSex | null;
  age: number | null;
  comfort: Comfort;
  /** True once the text-size prompt has been answered, either way. */
  comfortAsked: boolean;
  onFirstName: (name: string | null) => void;
  onSex: (v: PatientSex) => void;
  onAge: (v: number) => void;
}) {
  const [draftName, setDraftName] = useState(firstName ?? "");
  // Fine-tune appears after the first coarse pick, or immediately on a resumed session.
  const [fine, setFine] = useState(age !== null);
  const lastAnnounced = useRef<Comfort>(comfort);

  // Commit the name on a debounce rather than on every keystroke: the store is persisted
  // to sessionStorage, and writing it once per letter is pointless work.
  useEffect(() => {
    const t = setTimeout(() => onFirstName(cleanFirstName(draftName)), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftName]);

  /**
   * What to say under the age control, if anything.
   *
   * Three states, and the quiet one matters most: while the patient is eligible for the
   * text-size offer but has not been asked yet, this says NOTHING. The dialog is arriving
   * in half a second and announcing it first would be the form talking over itself.
   */
  const suggested = suggestedComfort(age);
  const scaleNote =
    comfort !== "standard"
      ? t("aboutScaleOn", lang, { label: comfortName(comfort, lang) })
      : comfortAsked && suggested !== "standard"
        ? t("aboutScaleUnchanged", lang)
        : null;
  useEffect(() => {
    lastAnnounced.current = comfort;
  }, [comfort]);

  return (
    <div className="flex flex-col gap-7">
      {/* ---------------- name ---------------- */}
      <section>
        <Label text={t("aboutNameLabel", lang)} optional optionalText={t("aboutNameOptional", lang)} />
        <input
          type="text"
          inputMode="text"
          autoComplete="given-name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder={t("aboutNamePlaceholder", lang)}
          aria-label={t("aboutNameAria", lang)}
          className={cn(
            "min-h-[56px] w-full rounded-2xl border-2 border-line bg-card px-4",
            "text-[17px] text-ink transition-colors placeholder:text-muted/60",
            "focus:border-brand focus:outline-none",
          )}
        />
        {/*
          The input, echoed. A name typed into a field that never says it back is a form
          taking something for nothing - and this is also the only honest place to say
          what happens to it, next to the box it was typed into.
        */}
        {/*
          One paragraph that changes its words, not two that cross-fade. The animated
          version waited for the old line to exit before mounting the new one, so the
          acknowledgement landed most of a second after the patient stopped typing - long
          enough to read as lag rather than as a response.
        */}
        <p
          className={cn(
            "mt-1.5 leading-snug",
            firstName === null
              ? "text-[12px] text-muted"
              : "text-[12.5px] font-medium text-brand-ink",
          )}
        >
          {firstName === null ? t("aboutNameNote", lang) : nameAck(firstName, lang)}
        </p>
      </section>

      {/* ---------------- sex ---------------- */}
      <section>
        <Label text={t("aboutSexLabel", lang)} />
        <div
          role="radiogroup"
          aria-label={t("aboutSexAria", lang)}
          className="flex flex-col gap-2.5"
        >
          {SEX_OPTIONS.map((o) => {
            const selected = sex === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  tick();
                  onSex(o.value);
                }}
                className={cn(
                  "flex min-h-[60px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left",
                  "transition-all duration-100 active:scale-[0.99]",
                  selected
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-card hover:border-brand/50",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[16.5px] font-bold leading-tight",
                      selected ? "text-brand-ink" : "text-ink",
                    )}
                  >
                    {t(o.label, lang)}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                    {t(o.gloss, lang)}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    // accent-icon-ok: the fill holds a tick, never a word.
                    selected ? "border-brand bg-brand text-white" : "border-line",
                  )}
                >
                  {selected ? <CheckIcon className="size-3.5" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------- age ---------------- */}
      <section>
        <Label text={t("aboutAgeLabel", lang)} />
        <div className="grid grid-cols-3 gap-2.5">
          {AGE_BANDS.map((b) => {
            const active = age !== null && nearestBand(age) === b.value;
            return (
              <button
                key={b.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  tick();
                  onAge(b.value);
                  setFine(true);
                }}
                className={cn(
                  "flex min-h-[62px] items-center justify-center rounded-2xl border-2",
                  "text-[16px] font-bold tabular-nums transition-all duration-100 active:scale-[0.98]",
                  active
                    ? "border-brand bg-brand-soft text-brand-ink"
                    : "border-line bg-card text-ink hover:border-brand/50",
                )}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {fine && age !== null ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="overflow-hidden"
            >
              <div className="mt-4 rounded-2xl border border-line bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-muted">
                    {t("aboutAgeExact", lang)}
                  </span>
                  <span className="text-[26px] font-bold tabular-nums leading-none text-brand">
                    {age}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Nudge label={t("aboutAgeYounger", lang)} onClick={() => onAge(clamp(age - 1))}>
                    &minus;
                  </Nudge>
                  <input
                    type="range"
                    min={AGE_MIN}
                    max={AGE_MAX}
                    step={1}
                    value={age}
                    aria-label={t("aboutAgeAria", lang)}
                    onChange={(e) => onAge(clamp(Number(e.target.value)))}
                    className="h-2 flex-1 cursor-grab appearance-none rounded-full bg-line accent-brand"
                  />
                  <Nudge label={t("aboutAgeOlder", lang)} onClick={() => onAge(clamp(age + 1))}>
                    +
                  </Nudge>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/*
          The state of the text size, after the patient has decided it. Not a promise
          about what the form is going to do - the answer they already gave, said back,
          with the way to change it.
        */}
        <AnimatePresence initial={false}>
          {scaleNote !== null ? (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-start gap-2.5 rounded-2xl border border-brand/30 bg-brand-soft/60 px-3.5 py-3 text-[13.5px] leading-snug text-brand-ink"
            >
              <span aria-hidden className="mt-[1px] text-[15px] font-bold">
                Aa
              </span>
              <span>
                <span className="font-bold">{scaleNote}</span> {t("aboutScaleChange", lang)}
              </span>
            </motion.p>
          ) : null}
        </AnimatePresence>
      </section>

      <p className="text-[12px] leading-snug text-muted">{ui(lang).aboutFooter}</p>
    </div>
  );
}

function Label({
  text,
  optional = false,
  optionalText,
}: {
  text: string;
  optional?: boolean;
  optionalText?: string;
}) {
  return (
    <p className="mb-2.5 flex items-baseline gap-2">
      <span className="text-[15px] font-bold text-ink">{text}</span>
      {optional ? (
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
          {optionalText}
        </span>
      ) : null}
    </p>
  );
}

function Nudge({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        tick();
        onClick();
      }}
      className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-line bg-paper text-[20px] font-bold text-ink transition-colors hover:border-brand hover:text-brand-ink active:scale-95"
    >
      {children}
    </button>
  );
}

const clamp = (n: number) => Math.min(AGE_MAX, Math.max(AGE_MIN, n));

/** Which band card to highlight for an exact age. */
function nearestBand(age: number): number {
  let best: number = AGE_BANDS[0].value;
  let bestGap = Infinity;
  for (const b of AGE_BANDS) {
    const gap = Math.abs(b.value - age);
    if (gap < bestGap) {
      bestGap = gap;
      best = b.value;
    }
  }
  return best;
}
