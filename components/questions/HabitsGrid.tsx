"use client";

/**
 * Q11 habits - six rows, two with conditional followups.
 *
 * Rows are driven by INTAKE_SCHEMA.sections[C].questions[11].rows, so the schema's
 * followup declarations are what make the severity and salon-detail inputs appear.
 * Nothing about the followups is hardcoded here beyond their input widget.
 *
 * `justFilled` marks rows the model wrote on this pass. They get a brief highlight
 * so the patient's eye lands on what changed and can correct it - that is the
 * "confirm chips" step, done in place rather than on a separate screen.
 */
import { motion } from "framer-motion";
import { INTAKE_SCHEMA } from "@/lib/schema";
import { SMOKING_SEV, WASH, type Habits } from "@/lib/types";
import { cn, tick } from "@/lib/utils";
import { optionLabel, t, type Lang } from "@/lib/i18n";
import type { TextKey } from "@/lib/copy.hi";
import { YesNo } from "./YesNo";

const HABIT_ROWS = INTAKE_SCHEMA.sections[2].questions[1].rows;

const LABELS: Record<string, { en: TextKey; help: TextKey }> = {
  smoking: { en: "habitSmoking", help: "habitSmokingHelp" },
  alcohol: { en: "habitAlcohol", help: "habitAlcoholHelp" },
  hard_water: { en: "habitWater", help: "habitWaterHelp" },
  hair_wash_frequency: { en: "habitWash", help: "habitWashHelp" },
  heating_tools_styling_chemicals: { en: "habitHeat", help: "habitHeatHelp" },
  salon_treatments: { en: "habitSalon", help: "habitSalonHelp" },
};

export function HabitsGrid({
  value,
  onChange,
  lang,
  justFilled = [],
}: {
  value: Habits;
  onChange: (patch: Partial<Habits>) => void;
  lang: Lang;
  justFilled?: string[];
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {HABIT_ROWS.map((row) => {
        const highlighted = justFilled.includes(row.key);
        return (
          <Row key={row.key} highlighted={highlighted}>
            <RowLabel field={row.key} lang={lang} />

            {row.key === "hair_wash_frequency" ? (
              <SegmentedRow
                options={WASH}
                lang={lang}
                value={value.hair_wash_frequency}
                onSelect={(v) => {
                  tick();
                  onChange({ hair_wash_frequency: v as Habits["hair_wash_frequency"] });
                }}
              />
            ) : (
              <YesNo
                size="sm"
                lang={lang}
                value={value[row.key as "smoking"]}
                onChange={(v) => {
                  tick();
                  // Flipping a trigger to false must clear its followup, or the output
                  // fails the "must be null when false" rule in validate.ts.
                  if (row.key === "smoking")
                    onChange({ smoking: v, smoking_severity: v ? value.smoking_severity : null });
                  else if (row.key === "salon_treatments")
                    onChange({
                      salon_treatments: v,
                      salon_treatment_detail: v ? value.salon_treatment_detail : null,
                    });
                  else onChange({ [row.key]: v } as Partial<Habits>);
                }}
              />
            )}

            {/* Conditional followups, revealed only when their trigger is true. */}
            {row.key === "smoking" && value.smoking ? (
              <Followup label={t("habitHowMuch", lang)} missing={value.smoking_severity === null}>
                <SegmentedRow
                  options={SMOKING_SEV}
                  lang={lang}
                  value={value.smoking_severity}
                  onSelect={(v) =>
                    onChange({ smoking_severity: v as Habits["smoking_severity"] })
                  }
                />
              </Followup>
            ) : null}

            {row.key === "salon_treatments" && value.salon_treatments ? (
              <Followup label={t("habitWhich", lang)} missing={!value.salon_treatment_detail}>
                <input
                  type="text"
                  inputMode="text"
                  value={value.salon_treatment_detail ?? ""}
                  placeholder={t("habitSalonPlaceholder", lang)}
                  onChange={(e) =>
                    onChange({ salon_treatment_detail: e.target.value.trim() || null })
                  }
                  className="min-h-[48px] w-full rounded-xl border border-line bg-paper px-3.5 text-[15px] text-ink transition-colors placeholder:text-muted/70 hover:border-brand/40 focus:border-brand focus:outline-none"
                />
              </Followup>
            ) : null}
          </Row>
        );
      })}
    </div>
  );
}

/**
 * A row that can flash to mark "the model just filled this".
 *
 * The flash used to animate between two hardcoded hex colours, which was wrong the
 * moment a dark palette existed. It is now a brand-soft overlay whose opacity fades
 * (see `.flash-fill` in globals.css), so it inherits whatever the current theme is.
 */
export function Row({
  children,
  highlighted,
}: {
  children: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-3.5">
      {highlighted ? (
        <span
          key="flash"
          aria-hidden
          className="flash-fill pointer-events-none absolute inset-0 rounded-2xl bg-brand-soft"
        />
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

function RowLabel({ field, lang }: { field: string; lang: Lang }) {
  const l = LABELS[field];
  return (
    <div className="mb-2.5">
      <p className="text-[14.5px] font-semibold leading-tight text-ink">
        {l === undefined ? field : t(l.en, lang)}
      </p>
      {l !== undefined ? (
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{t(l.help, lang)}</p>
      ) : null}
    </div>
  );
}

function Followup({
  label,
  missing,
  children,
}: {
  label: string;
  missing: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className={cn(
        "mt-3 overflow-hidden rounded-xl border-l-2 pl-3",
        // A dashed warm border is the "voice left this blank, please tap" signal.
        missing ? "border-warn/60" : "border-brand/40",
      )}
    >
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      {children}
    </motion.div>
  );
}

/** Horizontal option row; scrolls rather than wraps so row height stays predictable. */
export function SegmentedRow({
  options,
  value,
  lang,
  onSelect,
}: {
  options: readonly string[];
  value: string | null;
  lang: Lang;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="no-scrollbar -mx-0.5 flex gap-2 overflow-x-auto px-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onSelect(o)}
          className={cn(
            "min-h-[44px] shrink-0 rounded-xl border-2 px-3.5 text-[13px] font-semibold",
            "transition-colors active:scale-[0.97]",
            value === o
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-line bg-paper text-muted hover:border-brand/50 hover:bg-brand-soft/40 hover:text-ink",
          )}
        >
          {optionLabel(o, lang)}
        </button>
      ))}
    </div>
  );
}
