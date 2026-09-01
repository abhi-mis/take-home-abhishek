"use client";

/**
 * Q3 family history, Q5 conditions, Q10 recent events. (Q4 uses PatternPicker instead,
 * because it earns pictures.)
 *
 * Three rules worth naming:
 *
 * 1. EXCLUSIVE OPTIONS. "No known family history" and "None" are real schema options
 *    that logically contradict every other choice. Tapping one clears the rest;
 *    tapping anything else clears it. Enforced here for feel and again in
 *    validate.ts for correctness, so a voice patch can't produce ["Anemia","None"].
 *
 * 2. NONE ESCAPE HATCH. Q10 has no "none" option in the schema, but an empty answer is
 *    legitimate. Rather than invent a schema option, this renders a UI-only control
 *    whose selection is recorded in the store's `explicitNone` set. The answer stays
 *    exactly on-schema (`[]`), while validation can still tell "deliberately none"
 *    from "not answered yet" - which is what makes a strict per-step gate possible.
 *
 * 3. NOTHING IS OPTIONAL. There is no skip. An empty selection with no explicit "none"
 *    keeps Next disabled and prints why (see StepShell).
 */
import { OptionCard } from "../ui/Button";
import { OptionIcon, hasOptionIcon } from "./OptionIcons";
import { cn, tick } from "@/lib/utils";
import { optionLabel, type Lang } from "@/lib/i18n";

export function MultiChoice({
  options,
  values,
  exclusive,
  gloss,
  unavailable,
  lang,
  noneLabel,
  noneChosen = false,
  withIcons = false,
  onChange,
  onChooseNone,
}: {
  options: readonly string[];
  values: string[];
  exclusive?: string;
  gloss?: Record<string, string>;
  /**
   * option -> why this patient cannot pick it. Rendered greyed and unpressable rather
   * than removed, so the form is visibly reasoning rather than quietly editing itself.
   */
  unavailable?: Record<string, string>;
  lang: Lang;
  /** When set, renders the UI-only "none of these" affordance described above. */
  noneLabel?: string;
  noneChosen?: boolean;
  withIcons?: boolean;
  onChange: (next: string[]) => void;
  onChooseNone?: () => void;
}) {
  function toggle(opt: string) {
    if (unavailable?.[opt] !== undefined) return;
    tick();
    if (exclusive && opt === exclusive) {
      onChange(values.includes(opt) ? [] : [opt]);
      return;
    }
    const withoutExclusive = exclusive ? values.filter((v) => v !== exclusive) : values;
    onChange(
      withoutExclusive.includes(opt)
        ? withoutExclusive.filter((v) => v !== opt)
        : [...withoutExclusive, opt],
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {options.map((opt) => (
        <OptionCard
          key={opt}
          multi
          label={optionLabel(opt, lang)}
          gloss={gloss?.[opt]}
          icon={withIcons && hasOptionIcon(opt) ? <OptionIcon option={opt} /> : undefined}
          selected={values.includes(opt)}
          unavailable={unavailable?.[opt]}
          onSelect={() => toggle(opt)}
        />
      ))}

      {noneLabel !== undefined && onChooseNone ? (
        <button
          type="button"
          aria-pressed={noneChosen}
          onClick={() => {
            tick();
            onChooseNone();
          }}
          className={cn(
            "mt-1 min-h-[48px] rounded-2xl border px-4 py-3 text-[14px] font-medium",
            "transition-colors active:scale-[0.99]",
            noneChosen
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-dashed border-line bg-transparent text-muted hover:border-brand/50 hover:text-ink",
          )}
        >
          {noneLabel}
        </button>
      ) : null}
    </div>
  );
}
