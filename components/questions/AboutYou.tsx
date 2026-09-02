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
 * The design job here is to make that visible while it happens. Asking a stranger for their
 * age with no explanation is intrusive; asking for it and then watching the screen get larger
 * in front of you is obviously in your interest. So the comfort preview is live and sits
 * directly under the age control - the customisation is not a promise about later, it is the
 * thing you just did.
 *
 * FORM STATE lives in React Hook Form; ANSWERS live in the store.
 *
 * The two typed fields are registered with RHF and validated by `lib/formSchemas.ts`, and a
 * watch pushes them to the store: the name debounced, because the store is persisted to
 * sessionStorage and writing it once per letter is pointless work, and the age immediately,
 * mapped through `ageToStore` so an out-of-range box reads as "not answered" rather than
 * leaving the last good number behind.
 *
 * The draft/stored split is why the field cannot simply be bound to the number. A controlled
 * input holding `age` cannot represent "the patient has typed 1 so far and is about to type
 * 8": 1 is a valid age, so binding directly would either commit 1 or refuse the keystroke.
 * RHF holds what was typed; only a value inside the range reaches the store.
 *
 * That split is also why these two fields need a way BACK. An answer can now arrive from
 * outside the form state - a spoken reply fills name, sex and age at once - and a box seeded
 * once on mount would sit there empty while the store held the answer. See the second pair
 * of effects below.
 */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { t, ui, type Lang } from "@/lib/i18n";
import {
  cleanFirstName,
  comfortName,
  nameAck,
  suggestedComfort,
  type Comfort,
} from "@/lib/patient";
import { aboutFormSchema, ageToStore, normaliseAgeInput } from "@/lib/formSchemas";
import type { PatientSex } from "@/lib/types";
import type { TextKey } from "@/lib/copy.hi";
import { cn, tick } from "@/lib/utils";
import { CheckIcon } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { FemaleIcon, MaleIcon, PreferNotIcon } from "./OptionIcons";

const SEX_OPTIONS: {
  value: PatientSex;
  label: TextKey;
  gloss: TextKey;
  Icon: () => React.ReactElement;
}[] = [
  { value: "female", label: "aboutSexFemale", gloss: "aboutSexTwoApply", Icon: FemaleIcon },
  { value: "male", label: "aboutSexMale", gloss: "aboutSexTwoSkipped", Icon: MaleIcon },
  {
    value: "prefer_not",
    label: "aboutSexPreferNot",
    gloss: "aboutSexTwoSkipped",
    Icon: PreferNotIcon,
  },
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
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(aboutFormSchema(lang)),
    // As they type, so an impossible age is caught at the keystroke rather than at Next.
    mode: "onChange",
    // Seeded from the store, so a resumed session opens with the boxes already filled.
    defaultValues: {
      firstName: firstName ?? "",
      age: age === null ? "" : String(age),
    },
  });

  const nameValue = watch("firstName");
  const ageValue = watch("age");

  useEffect(() => {
    const id = setTimeout(() => onFirstName(cleanFirstName(nameValue)), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameValue]);

  useEffect(() => {
    onAge(ageToStore(ageValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageValue]);

  /*
    THE OTHER DIRECTION, and it is not symmetry for its own sake.

    RHF seeds these boxes from `defaultValues` exactly once, on mount. That was fine while
    typing was the only way to fill them; then the microphone arrived, and "Mera naam Anita
    hai, main 34 saal ki hoon" set the store while both boxes stayed empty - the form said
    "Filled 3 of 3" over a blank age field. So a store value the box does not already
    represent is pushed in.

    Both effects depend ONLY on the store value, never on what is typed, which is what
    keeps them from fighting the keyboard: a keystroke changes `ageValue`, that reaches the
    store, and this effect does not re-run at all. When it does run, it returns early
    because the box already represents the stored value.

    Null is never pushed. A null store value means "not answered", and clearing a box a
    patient is halfway through typing is not something an answer elsewhere may do.
  */
  useEffect(() => {
    if (age === null) return;
    if (ageToStore(ageValue) === age) return;
    setValue("age", String(age), { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [age]);

  useEffect(() => {
    if (firstName === null) return;
    if (cleanFirstName(nameValue) === firstName) return;
    setValue("firstName", firstName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName]);

  const ageField = register("age");

  /**
   * What to say under the age control, if anything.
   *
   * Three states, and the quiet one matters most: while the patient is eligible for the
   * text-size offer but has not been asked yet, this says NOTHING. The dialog is arriving in
   * half a second and announcing it first would be the form talking over itself.
   */
  const suggested = suggestedComfort(age);
  const scaleNote =
    comfort !== "standard"
      ? t("aboutScaleOn", lang, { label: comfortName(comfort, lang) })
      : comfortAsked && suggested !== "standard"
        ? t("aboutScaleUnchanged", lang)
        : null;

  return (
    <div className="flex flex-col gap-5 desk:gap-6">
      {/* ---------------- name ---------------- */}
      <TextField
        {...register("firstName")}
        label={t("aboutNameLabel", lang)}
        badge={t("aboutNameOptional", lang)}
        autoComplete="given-name"
        placeholder={t("aboutNamePlaceholder", lang)}
        /*
          The input, echoed. A name typed into a field that never says it back is a form
          taking something for nothing - and this is also the only honest place to say what
          happens to it, next to the box it was typed into.

          One line that changes its words, not two that cross-fade: the animated version
          waited for the old line to exit before mounting the new one, so the acknowledgement
          landed most of a second after the patient stopped typing, which reads as lag.
        */
        hint={
          <span className={firstName === null ? undefined : "font-medium text-brand-ink"}>
            {firstName === null ? t("aboutNameNote", lang) : nameAck(firstName, lang)}
          </span>
        }
      />

      {/* ---------------- sex ---------------- */}
      <section>
        <p className="mb-2 text-[15px] font-bold text-ink">{t("aboutSexLabel", lang)}</p>
        {/*
          Three across from `desk` up, stacked on a phone.

          Stacked everywhere, these three cards were 200px of a card that was already the
          tallest in the form. Three columns on a wide screen costs nothing - the labels are
          one or two words - and the gloss underneath each is what a patient actually needs,
          so it stays.
        */}
        <div
          role="radiogroup"
          aria-label={t("aboutSexAria", lang)}
          className="flex flex-col gap-2.5 desk:grid desk:grid-cols-3 desk:gap-2.5"
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
                  "flex min-h-[52px] items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-left",
                  "transition-all duration-100 active:scale-[0.99]",
                  "desk:min-h-[112px] desk:flex-col desk:items-start desk:justify-center desk:gap-1.5 desk:p-4",
                  selected
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-card hover:border-brand/50",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "shrink-0 transition-colors",
                    selected ? "text-brand-ink" : "text-muted",
                  )}
                >
                  <o.Icon />
                </span>
                <span className="min-w-0 flex-1 desk:flex-none">
                  <span
                    className={cn(
                      "block text-[16px] font-bold leading-tight",
                      selected ? "text-brand-ink" : "text-ink",
                    )}
                  >
                    {t(o.label, lang)}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                    {t(o.gloss, lang)}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors desk:hidden",
                    // accent-icon-ok: the fill holds a tick, never a word.
                    selected ? "border-brand bg-brand text-white" : "border-line",
                  )}
                >
                  {selected ? <CheckIcon className="size-3" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------- age ---------------- */}
      <section>
        {/*
          A plain field with a numeric keypad. `inputMode="numeric"` on a `type="text"` input
          deliberately: a number input brings spinners nobody wants on a phone, silently
          accepts "1e5", and reports an empty string for invalid input, so a typo becomes
          indistinguishable from a blank. Text plus a numeric keypad gives the keypad without
          any of that.
        */}
        <TextField
          {...ageField}
          label={t("aboutAgeLabel", lang)}
          emphasis
          suffix={t("aboutAgeYears", lang)}
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={3}
          placeholder={t("aboutAgePlaceholder", lang)}
          error={errors.age?.message}
          boxClassName="max-w-[220px]"
          onChange={(e) => {
            // Sanitise before it lands in form state, so a stray letter never becomes part
            // of the value and the box never shows "007" for a seven-year-old.
            setValue("age", normaliseAgeInput(e.target.value), {
              shouldValidate: true,
              shouldDirty: true,
            });
          }}
        />

        {/*
          The state of the text size, after the patient has decided it. Not a promise about
          what the form is going to do - the answer they already gave, said back, with the way
          to change it.
        */}
        <AnimatePresence initial={false}>
          {scaleNote !== null ? (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-start gap-2.5 rounded-2xl border border-brand/30 bg-brand-soft/60 px-3.5 py-2.5 text-[13px] leading-snug text-brand-ink"
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
