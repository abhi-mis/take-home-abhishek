"use client";

/**
 * Q2 duration, Q6 menstrual, Q7 pregnancy, Q15 sample type.
 *
 * These used to auto-advance: tapping an option wrote the answer and moved on after a
 * 180ms beat, which turned a 16-question form into 16 taps instead of 32. That saving was
 * real and it was the wrong trade for a medical form. The cost is asymmetric - one extra
 * tap is a mild inconvenience, while a mis-tap that both records an answer and leaves the
 * screen is a wrong answer in a clinical record that the patient never sees again.
 *
 * So the answer is now selected and confirmed separately, and Next is always on screen.
 *
 * `suggestion` is the "pre-select and confirm" affordance (used by Q6). It renders a
 * one-tap accept banner above the list. It never writes to the store on its own:
 * a suggestion the patient ignores must leave the answer untouched, or the output
 * would contain something nobody said.
 */
import { motion } from "framer-motion";
import { OptionCard } from "../ui/Button";
import { OptionIcon, hasOptionIcon } from "./OptionIcons";
import { tick } from "@/lib/utils";
import { optionLabel, t, type Lang } from "@/lib/i18n";

export function SingleChoice({
  options,
  value,
  gloss,
  suggestion,
  lang,
  withIcons = false,
  onChange,
}: {
  options: readonly string[];
  value: string | null;
  gloss?: Record<string, string>;
  suggestion?: { value: string; reason: string };
  lang: Lang;
  withIcons?: boolean;
  onChange: (v: string) => void;
}) {
  function choose(opt: string) {
    tick();
    onChange(opt);
  }

  const showSuggestion = suggestion !== undefined && value === null;

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
            className="mt-2.5 min-h-[44px] w-full rounded-xl bg-ink px-4 text-[14px] font-semibold text-paper transition-colors hover:bg-brand-strong active:scale-[0.98]"
          >
            {t("suggestionAcceptWith", lang, { value: optionLabel(suggestion.value, lang) })}
          </button>
        </motion.div>
      ) : null}

      {/*
        Two columns from `desk` up: one-item-per-row on a 700px pane is a phone layout being
        shown to a desktop. Halves the height without shrinking a single tap target.
      */}
      <div
        role="radiogroup"
        className="flex flex-col gap-2.5 desk:grid desk:grid-cols-2 desk:gap-2.5"
      >
        {options.map((opt) => (
          <OptionCard
            key={opt}
            label={optionLabel(opt, lang)}
            gloss={gloss?.[opt]}
            icon={withIcons && hasOptionIcon(opt) ? <OptionIcon option={opt} /> : undefined}
            selected={value === opt}
            onSelect={() => choose(opt)}
          />
        ))}
      </div>
    </div>
  );
}
