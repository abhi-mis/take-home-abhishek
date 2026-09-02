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
  onAge: (v: number | null) => void;
}) {
  const [draftName, setDraftName] = useState(firstName ?? "");
  /**
   * The age box's own text, kept separate from the stored number.
   *
   * A controlled input bound straight to the number cannot represent "the patient has typed
   * 1 so far and is about to type 8": 1 is a valid age, so binding directly would either
   * commit 1 or refuse the keystroke. The draft holds what was typed, and only a value
   * inside the range reaches the store.
   */
  const [ageDraft, setAgeDraft] = useState(age === null ? "" : String(age));
  const ageError = ageDraft !== "" && !(Number(ageDraft) >= AGE_MIN && Number(ageDraft) <= AGE_MAX);
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

        {/*
          A plain field with a numeric keypad, and it is the PRIMARY way to answer.

          The decade cards used to be the only way in, with a slider to fine-tune. That is a
          nice interaction and the wrong default for a fact the patient knows exactly: asking
          someone to pick a range and then nudge a slider to reach "34" is three interactions
          to enter two digits. The cards stay underneath as a shortcut for anyone who would
          rather not type, or does not know their age precisely.

          `inputMode="numeric"` with `type="text"` rather than `type="number"`, deliberately:
          a number input brings spinners nobody wants on a phone, silently accepts "1e5", and
          reports an empty string for invalid input so a typo is indistinguishable from a
          blank. Text plus a numeric keypad gives the keypad without any of that.
        */}
        <div className="flex items-stretch gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={3}
              value={ageDraft}
              aria-label={t("aboutAgeFieldLabel", lang)}
              aria-invalid={ageError}
              aria-describedby={ageError ? "age-error" : undefined}
              placeholder={t("aboutAgePlaceholder", lang)}
              onChange={(e) => {
                // Digits only, so a stray letter never becomes part of the value, and no
                // leading zeros, so the box never shows "007" for a seven-year-old.
                const digits = e.target.value
                  .replace(/[^0-9]/g, "")
                  .slice(0, 3)
                  .replace(/^0+(?=\d)/, "");
                setAgeDraft(digits);
                const n = Number(digits);
                const valid = digits !== "" && n >= AGE_MIN && n <= AGE_MAX;
                /*
                  An out-of-range box means NOT ANSWERED, not "keep the last good number".

                  Committing only valid values sounds safer and is worse: type 120 over a
                  stored 12 and the screen shows 120 with an error while the form quietly
                  holds 12, counts the question answered, and lets you leave. Clearing it
                  makes the section incomplete, which is the truth.
                */
                onAge(valid ? n : null);
              }}
              className={cn(
                "min-h-[64px] w-full rounded-2xl border-2 bg-card px-4 text-[24px] font-bold tabular-nums",
                "text-ink transition-colors placeholder:text-[17px] placeholder:font-medium placeholder:text-muted/60",
                "focus:outline-none",
                ageError ? "border-warn" : "border-line focus:border-brand",
              )}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-medium text-muted"
            >
              {t("aboutAgeYears", lang)}
            </span>
          </div>
        </div>

        {ageError ? (
          <p id="age-error" role="alert" className="mt-2 text-[13px] font-medium text-warn">
            {t("aboutAgeRangeError", lang, { min: AGE_MIN, max: AGE_MAX })}
          </p>
        ) : null}

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
