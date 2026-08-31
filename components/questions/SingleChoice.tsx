"use client";

/**
 * Q2 duration, Q6 menstrual, Q7 pregnancy, Q15 sample type.
 *
 * Auto-advance: picking an option writes the answer and moves on after a 180ms beat
 * — long enough that the patient sees their choice register, short enough that it
 * never feels like waiting. That beat is why these steps hide the Next button.
 *
 * `suggestion` is the "pre-select and confirm" affordance (used by Q6). It renders a
 * one-tap accept banner above the list. It never writes to the store on its own:
 * a suggestion the patient ignores must leave the answer untouched, or the output
 * would contain something nobody said.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { OptionCard } from "../ui/Button";
import { OptionIcon, hasOptionIcon } from "./OptionIcons";
import { tick } from "@/lib/utils";

export function SingleChoice({
  options,
  value,
  gloss,
  suggestion,
  withIcons = false,
  onChange,
  onAdvance,
}: {
  options: readonly string[];
  value: string | null;
  gloss?: Record<string, string>;
  suggestion?: { value: string; reason: string };
  withIcons?: boolean;
  onChange: (v: string) => void;
  onAdvance?: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (pending === null || !onAdvance) return;
    const t = setTimeout(onAdvance, 180);
    return () => clearTimeout(t);
  }, [pending, onAdvance]);

  function choose(opt: string) {
    tick();
    onChange(opt);
    setPending(opt);
  }

  const showSuggestion = suggestion !== undefined && value === null && pending === null;

  return (
    <div className="flex flex-col gap-4">
      {showSuggestion ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-dashed border-brand/45 bg-brand-soft p-3.5"
        >
          <p className="text-[13.5px] leading-snug text-brand-ink">{suggestion.reason}</p>
          <button
            type="button"
            onClick={() => choose(suggestion.value)}
            className="mt-2.5 min-h-[44px] w-full rounded-xl bg-brand px-4 text-[14px] font-semibold text-white active:scale-[0.98]"
          >
            Yes — {suggestion.value}
          </button>
        </motion.div>
      ) : null}

      <div role="radiogroup" className="flex flex-col gap-2.5">
        {options.map((opt) => (
          <OptionCard
            key={opt}
            label={opt}
            gloss={gloss?.[opt]}
            icon={withIcons && hasOptionIcon(opt) ? <OptionIcon option={opt} /> : undefined}
            selected={(pending ?? value) === opt}
            onSelect={() => choose(opt)}
          />
        ))}
      </div>
    </div>
  );
}
