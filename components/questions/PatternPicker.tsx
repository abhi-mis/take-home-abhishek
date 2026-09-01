"use client";

/**
 * Q4 - the picture question.
 *
 * A two-column grid of diagram cards instead of a list of chips. The patient matches a
 * shape to what they see in the mirror, which is both faster and more accurate than
 * parsing "Diffuse thinning". Multi-select, because real scalps do more than one thing
 * at once.
 *
 * Selection state is carried by border, background, a check badge AND the diagram
 * brightening - never colour alone.
 */
import { motion } from "framer-motion";
import { PATTERN } from "@/lib/types";
import { cn, tick } from "@/lib/utils";
import { optionLabel, questionCopy, t, ui, type Lang } from "@/lib/i18n";
import { ScalpDiagram } from "./ScalpDiagram";
import { CheckIcon } from "../ui/Button";

export function PatternPicker({
  values,
  noneChosen,
  lang,
  onChange,
  onChooseNone,
}: {
  values: string[];
  noneChosen: boolean;
  lang: Lang;
  onChange: (next: string[]) => void;
  onChooseNone: () => void;
}) {
  const gloss = questionCopy(lang).pattern.gloss ?? {};

  function toggle(opt: string) {
    tick();
    onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        {PATTERN.map((opt) => {
          const selected = values.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={optionLabel(opt, lang)}
              onClick={() => toggle(opt)}
              className={cn(
                "relative flex flex-col overflow-hidden rounded-2xl border-2 p-2 text-left",
                "transition-all duration-100 active:scale-[0.98]",
                selected
                  ? "border-brand bg-brand-soft"
                  : "border-line bg-card hover:border-brand/45 hover:bg-brand-soft/30 hover:shadow-sm",
              )}
            >
              {selected ? (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-brand text-white"
                >
                  <CheckIcon className="size-3.5" />
                </motion.span>
              ) : null}

              <span
                className={cn(
                  "mx-auto block h-[104px] w-[104px] transition-opacity",
                  selected ? "opacity-100" : "opacity-80",
                )}
              >
                <ScalpDiagram option={opt} />
              </span>

              <span className="mt-1 block px-1 pb-0.5">
                <span
                  className={cn(
                    "block text-[13px] font-semibold leading-tight",
                    selected ? "text-brand-ink" : "text-ink",
                  )}
                >
                  {optionLabel(opt, lang)}
                </span>
                {gloss[opt] ? (
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                    {gloss[opt]}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        Q4 has no "none" option in the schema, but "I cannot tell" is a real answer.
        This UI-only control records the choice in the store's explicitNone set and
        writes [] to the answer - so validation is satisfied without inventing an option.
      */}
      <button
        type="button"
        aria-pressed={noneChosen}
        onClick={() => {
          tick();
          onChooseNone();
        }}
        className={cn(
          "min-h-[48px] rounded-2xl border px-4 py-3 text-[14px] font-medium transition-colors active:scale-[0.99]",
          noneChosen
            ? "border-brand bg-brand-soft text-brand-ink"
            : "border-dashed border-line bg-transparent text-muted hover:border-brand/50 hover:text-ink",
        )}
      >
        {t("patternNotSure", lang, { label: ui(lang).notSure })}
      </button>
    </div>
  );
}
