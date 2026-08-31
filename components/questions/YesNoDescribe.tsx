"use client";

/**
 * Q14 - yes/no, and if yes, describe it.
 *
 * The describe box is the one place in the form where free text is genuinely the
 * right answer (side effects are open-ended and clinically important), so it gets
 * both a keyboard and the mic. Voice here is speak-or-type in the literal sense:
 * the same field receives either.
 *
 * No auto-advance on the yes/no, because tapping "Yes" reveals a required field
 * directly below it - advancing would hide the thing the patient now has to fill.
 */
import { AnimatePresence, motion } from "framer-motion";
import type { Answers } from "@/lib/types";
import { VoicePanel } from "./VoicePanel";
import { YesNo } from "./YesNo";

export function YesNoDescribe({
  answers,
  patch,
}: {
  answers: Answers;
  patch: (p: Partial<Answers>) => void;
}) {
  const had = answers.past_treatment_side_effects;

  return (
    <div className="flex flex-col gap-4">
      <YesNo
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
              <p className="mb-3 text-[14px] font-semibold text-ink">
                Tell us a little more - you can speak it if you prefer.
              </p>

              <VoicePanel
                questionKey="past_treatment_side_effects"
                onResult={(r) => {
                  // The slice may also correct the yes/no if the patient said no.
                  if (r.patch.past_treatment_describe)
                    patch({ past_treatment_describe: r.patch.past_treatment_describe });
                }}
              />

              <textarea
                value={answers.past_treatment_describe ?? ""}
                onChange={(e) => patch({ past_treatment_describe: e.target.value || null })}
                placeholder="e.g. minoxidil made my scalp itch and burn"
                rows={4}
                className="w-full rounded-2xl border border-line bg-card p-3.5 text-[15px] leading-snug text-ink transition-colors placeholder:text-muted/70 hover:border-brand/40 focus:border-brand focus:outline-none"
              />
              {!answers.past_treatment_describe ? (
                <p className="mt-2 text-[12.5px] text-warn">
                  This is required - it tells your doctor what to avoid.
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
