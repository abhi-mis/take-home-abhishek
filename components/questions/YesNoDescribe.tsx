"use client";

/**
 * Q14 - yes/no, and if yes, describe it.
 *
 * The describe box is the one place in the form where free text is genuinely the right answer:
 * side effects are open-ended and clinically important, and a list of options would either
 * miss the one that happened or put words in the patient's mouth.
 *
 * It is a React Hook Form field, with the "required once you have said yes" rule declared in
 * `lib/formSchemas.ts` rather than derived from the store inline. The rule is not new -
 * `validate.ts` already rejects the output when the flag is true and the description is empty -
 * but it used to be restated here as `!answers.past_treatment_describe`, which meant the
 * message appeared the instant the field was revealed, before the patient had typed a
 * character. Telling someone their answer is wrong before they have given one is the form
 * scolding them for arriving. RHF's `touchedFields` is the distinction that was missing.
 *
 * Nothing here advances on its own - no question does any more - which matters most on this
 * one: tapping "Yes" reveals a required field directly below it, and advancing would hide the
 * very thing the patient now has to fill.
 */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import type { Answers } from "@/lib/types";
import { YesNo } from "./YesNo";
import { describeFormSchema } from "@/lib/formSchemas";
import { t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function YesNoDescribe({
  answers,
  patch,
  lang,
}: {
  answers: Answers;
  patch: (p: Partial<Answers>) => void;
  lang: Lang;
}) {
  const had = answers.past_treatment_side_effects;

  const {
    register,
    setValue,
    formState: { errors, touchedFields },
  } = useForm({
    resolver: zodResolver(describeFormSchema(lang)),
    mode: "onChange",
    defaultValues: { describe: answers.past_treatment_describe ?? "" },
  });

  const stored = answers.past_treatment_describe ?? "";

  /*
    THE STORE OWNS THE TEXT; RHF only mirrors it to produce the error message.

    This used to be the other way round - the box was RHF's, and an effect pushed it to the
    store - and the microphone broke it in the worst way available. A spoken reply writes
    both fields at once, so `had` went true in the same commit that the description
    arrived; the push-out effect then ran with the box still holding the empty string it
    was seeded with on mount, decided the patient had cleared the field, and wrote null
    over the description that had just been recorded. The patient saw "Filled 2 of 2" and
    an empty box.

    Unlike the age field there is no draft to protect here: every character of free text is
    a legal value, so binding straight to the store costs nothing and removes the race
    entirely. The mirror below keeps RHF's copy in step so the "please describe it" message
    reflects what is actually on screen.
  */
  useEffect(() => {
    setValue("describe", stored, { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  // Shown only once the patient has been in the box. See the note at the top of the file.
  const error = touchedFields.describe === true ? errors.describe?.message : undefined;

  return (
    <div className="flex flex-col gap-4">
      <YesNo
        lang={lang}
        value={had}
        onChange={(v) =>
          patch({
            past_treatment_side_effects: v,
            // "No" must clear the description, or validate.ts rejects the output.
            past_treatment_describe: v ? answers.past_treatment_describe : null,
          })
        }
      />

      <AnimatePresence initial={false}>
        {had === true ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-1">
              <label
                htmlFor="side-effect-describe"
                className="mb-2 block text-[14px] font-semibold text-ink"
              >
                {t("sideEffectMore", lang)}
              </label>

              <textarea
                {...register("describe")}
                value={stored}
                onChange={(e) => {
                  const raw = e.target.value;
                  // An empty box is a null, not an empty string: that is what the output
                  // schema expects, and what validate.ts checks for.
                  patch({ past_treatment_describe: raw.trim() === "" ? null : raw });
                }}
                id="side-effect-describe"
                placeholder={t("sideEffectPlaceholder", lang)}
                rows={3}
                aria-invalid={error !== undefined}
                aria-describedby={error !== undefined ? "side-effect-error" : undefined}
                className={cn(
                  "w-full rounded-2xl border-2 bg-card p-3.5 text-[15px] leading-snug text-ink",
                  "transition-colors placeholder:text-muted/70 focus:outline-none",
                  error !== undefined ? "border-warn" : "border-line focus:border-brand",
                )}
              />
              {error !== undefined ? (
                <p
                  id="side-effect-error"
                  role="alert"
                  className="mt-1.5 text-[12.5px] font-medium text-warn"
                >
                  {error}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
