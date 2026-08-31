"use client";

/**
 * The sex question — asked ONCE, immediately before section B, and only to gate Q6/Q7.
 *
 * Why it is a question and not an inference: Q9 ("excess body or facial hair") would
 * technically correlate, but inferring a patient's sex from a hirsutism answer is both
 * unreliable (men answer yes constantly; PCOS patients answer yes) and unpleasant to
 * be on the receiving end of. Asking costs one tap and is honest about why.
 *
 * "Prefer not to say" is a real option, not a courtesy: it gates Q6/Q7 out exactly
 * like "male" does, and the resulting nulls are marked valid by validate.ts, so
 * declining never blocks the form.
 */
import { motion } from "framer-motion";
import { UI_COPY } from "@/lib/copy";
import { OptionCard } from "../ui/Button";
import type { PatientSex } from "@/lib/types";
import { tick } from "@/lib/utils";
import { useEffect, useState } from "react";

const OPTIONS: { value: PatientSex; label: string; gloss: string }[] = [
  { value: "female", label: "Female", gloss: "We will ask two extra questions" },
  { value: "male", label: "Male", gloss: "Those two will be skipped" },
  { value: "prefer_not", label: "Prefer not to say", gloss: "This skips the two questions" },
];

export function SexGate({
  value,
  onChange,
  onAdvance,
}: {
  value: PatientSex | null;
  onChange: (v: PatientSex) => void;
  onAdvance?: () => void;
}) {
  const [pending, setPending] = useState<PatientSex | null>(null);

  useEffect(() => {
    if (pending === null || !onAdvance) return;
    const t = setTimeout(onAdvance, 220);
    return () => clearTimeout(t);
  }, [pending, onAdvance]);

  return (
    <div className="flex flex-col gap-4">
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-2xl bg-brand-soft px-4 py-3 text-[14px] leading-snug text-brand-ink"
      >
        {UI_COPY.sexGateBody}
      </motion.p>

      <div role="radiogroup" className="flex flex-col gap-2.5">
        {OPTIONS.map((o) => (
          <OptionCard
            key={o.value}
            label={o.label}
            gloss={o.gloss}
            selected={(pending ?? value) === o.value}
            onSelect={() => {
              tick();
              onChange(o.value);
              setPending(o.value);
            }}
          />
        ))}
      </div>

      <p className="text-[12px] leading-snug text-muted">
        {UI_COPY.sexGateFooter}
      </p>
    </div>
  );
}
