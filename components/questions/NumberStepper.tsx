"use client";

/**
 * Q1 - "At what age did your hair loss start?" - a single number field.
 *
 * This used to be five decade-preset cards plus a fine-tune slider underneath. It came out
 * for the reason a patient actually has: they already know the number, or a close one, and
 * a grid of cards is more taps to reach it than typing three digits ever was. One labelled
 * box, a numeric keypad, done.
 *
 * The bound is still enforced, just without a screenful of cards to carry it: onset cannot
 * exceed the current age this patient gave (see `maxOnsetAge`), and if that age is not yet
 * known the box accepts `ONSET_MIN` to `AGE_MAX` - 16 to 100 - the same floor and ceiling
 * the rest of the form uses.
 */
import { useEffect, useState } from "react";
import { TextField } from "../ui/TextField";
import { AGE_MAX, ONSET_MIN } from "@/lib/patient";
import { t, type Lang } from "@/lib/i18n";

export function NumberStepper({
  value,
  lang,
  max = AGE_MAX,
  currentAge = null,
  onChange,
}: {
  lang: Lang;
  value: number | null;
  /**
   * Upper bound, which is the patient's own age once they have given it.
   *
   * Not cosmetic: without it a 45-year-old can type 60 and the doctor receives "hair loss
   * began at 60" as a fact. Defaults to `AGE_MAX` for the case where the current age is not
   * yet known - see `maxOnsetAge` in lib/patient.ts, which is what callers actually pass.
   */
  max?: number;
  /**
   * The patient's own age, straight from `meta` - used only to phrase the hint under the
   * box ("you are 34, so this can be anywhere from 16 to 34"). Kept separate from `max`
   * rather than inferred from it, because `max` is 100 in two different situations - the
   * age genuinely being unknown, and a patient who is genuinely 100 - and only one of those
   * should claim to know the patient's age.
   */
  currentAge?: number | null;
  /** `null` while the box holds nothing, or something outside `ONSET_MIN..max`. */
  onChange: (v: number | null) => void;
}) {
  /*
    A draft, not the number, for the reason every typed field in this form keeps one: a
    controlled input holding `value` cannot represent "the patient has typed 3 so far and is
    about to type 4" - 3 is a legal age, so binding directly would either commit 3 or refuse
    the keystroke. The draft is free to be a partial or out-of-range string; only a value
    inside `ONSET_MIN..max` is ever handed to `onChange`.
  */
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  /*
    Catch up when the store changes from OUTSIDE this box - a voice fill, a correction to
    the current age that pulls this one down with it (see `clampOnsetAge` in lib/store.ts).
    Guarded on the box already representing the stored value, so a keystroke never gets
    overwritten by its own effect.
  */
  useEffect(() => {
    if (value === null) return;
    if (draft.trim() !== "" && Number(draft) === value) return;
    setDraft(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const typed = draft.trim();
  const n = typed === "" ? null : Number(typed);
  const outOfRange = n !== null && (n < ONSET_MIN || n > max);

  return (
    <TextField
      label={t("onsetAria", lang)}
      value={draft}
      inputMode="numeric"
      autoComplete="off"
      pattern="[0-9]*"
      maxLength={3}
      emphasis
      suffix={t("onsetYears", lang)}
      placeholder={t("aboutAgePlaceholder", lang)}
      error={outOfRange ? t("aboutAgeRangeError", lang, { min: ONSET_MIN, max }) : undefined}
      hint={
        outOfRange
          ? undefined
          : currentAge !== null
            ? t("noteOnsetRange", lang, { age: currentAge, min: ONSET_MIN })
            : t("aboutAgeRangeError", lang, { min: ONSET_MIN, max })
      }
      boxClassName="max-w-[220px]"
      onChange={(e) => {
        // Sanitise before it lands in the draft, so a stray letter never becomes part of
        // the value - the same rule the About You age field follows.
        const clean = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
        setDraft(clean);
        const parsed = clean === "" ? null : Number(clean);
        onChange(parsed !== null && parsed >= ONSET_MIN && parsed <= max ? parsed : null);
      }}
    />
  );
}
