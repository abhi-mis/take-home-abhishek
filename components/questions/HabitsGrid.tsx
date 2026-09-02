"use client";

/**
 * Q11 habits - six rows, two with conditional followups.
 *
 * Rows are driven by INTAKE_SCHEMA.sections[C].questions[11].rows, so the schema's
 * followup declarations are what make the severity and salon-detail inputs appear.
 * Nothing about the followups is hardcoded here beyond their input widget.
 *
 * so the patient's eye lands on what changed and can correct it - that is the
 * "confirm chips" step, done in place rather than on a separate screen.
 */
import { motion } from "framer-motion";
import { INTAKE_SCHEMA } from "@/lib/schema";
import { WASH, type Habits } from "@/lib/types";
import {
  NEGATIVE,
  SMOKING_MERGED,
  mergedOptions,
  mergedPatch,
  mergedSelection,
} from "@/lib/apply";
import { cn, tick } from "@/lib/utils";
import { optionLabel, t, ui, type Lang } from "@/lib/i18n";
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

/*
  The geometry of a row whose control is a list of options.

  `basis` rather than `shrink-0` is the whole fix. With `shrink-0` the options kept their
  content width and simply overflowed the card - on a 390px phone "Severe >10/day" was off
  the right edge entirely, and the hair-wash label was squeezed into a 140px column that
  wrapped to one word per line. Asking for 320px instead means the options sit beside the
  label while there is room for both, and when there is not they take a line of their own at
  full width - which is what lets their own `flex-wrap` put the buttons on two rows.
*/
const OPTION_ROW = "flex flex-wrap items-center gap-x-4 gap-y-2.5";
const OPTION_ROW_LABEL = "min-w-[45%] flex-1";
const OPTION_ROW_CONTROL = "min-w-0 flex-1 basis-[320px]";

export function HabitsGrid({
  value,
  onChange,
  lang,
}: {
  value: Habits;
  onChange: (patch: Partial<Habits>) => void;
  lang: Lang;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {HABIT_ROWS.map((row) => {
        return (
          <Row key={row.key}>
            {/*
              Label on the left, control on the right, rather than stacked.

              Stacked, six habit rows came to about 660px - the label block, then the
              control underneath, then 2.5rem of gap, six times over. Side by side the same
              six rows are around 380px with nothing removed and nothing shrunk below a 44px
              target. `row-split` is the existing escape hatch: at the largest text size it
              stacks them again, because at that size there genuinely is not room for two
              columns.
            */}
            {/*
              Smoking asks one question, not two.

              It used to be a Yes/No and then, once you said Yes, a revealed "how much?" with
              three options - two stages for one fact, where the first told nobody anything.
              Nobody picks "Mild <5/day" without smoking. The negative is now just the first
              option in the same row, and `lib/apply.ts` maps the tap back to the schema's
              `{ smoking, smoking_severity }` pair, so the JSON is identical either way.

              It gets its own line because four options never sit beside a label on a phone.
            */}
            {row.key === "smoking" || row.key === "hair_wash_frequency" ? (
              // Both option rows, same geometry. See OPTION_ROW above.
              <div className={OPTION_ROW}>
                <div className={OPTION_ROW_LABEL}>
                  <RowLabel field={row.key} lang={lang} />
                </div>
                {row.key === "hair_wash_frequency" ? (
                  <SegmentedRow
                    wrap
                    className={OPTION_ROW_CONTROL}
                    ariaLabel={t("habitWashHelp", lang)}
                    options={WASH}
                    lang={lang}
                    value={value.hair_wash_frequency}
                    onSelect={(v) => {
                      tick();
                      onChange({ hair_wash_frequency: v as Habits["hair_wash_frequency"] });
                    }}
                  />
                ) : (
                <SegmentedRow
                  wrap
                  className={OPTION_ROW_CONTROL}
                  ariaLabel={t("habitSmokingHelp", lang)}
                  options={mergedOptions(SMOKING_MERGED)}
                  labels={{ [NEGATIVE]: ui(lang).no }}
                  lang={lang}
                  value={mergedSelection(value as unknown as Record<string, unknown>, SMOKING_MERGED)}
                  onSelect={(v) => {
                    tick();
                    onChange(mergedPatch(SMOKING_MERGED, v) as Partial<Habits>);
                  }}
                />
                )}
              </div>
            ) : (
            <div className="row-split flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <RowLabel field={row.key} lang={lang} />
              </div>
              <div className="row-control shrink-0">
              <YesNo
                size="sm"
                lang={lang}
                value={value[row.key as "smoking"]}
                onChange={(v) => {
                  tick();
                  /*
                    Only salon treatments still needs the null-clearing branch here.
                    Smoking used to as well, and its case stayed behind for a moment after
                    the merged control took over - unreachable code that still looked like
                    the rule, which is how a rule ends up being enforced in one place and
                    quietly not in another.
                  */
                  if (row.key === "salon_treatments")
                    onChange({
                      salon_treatments: v,
                      salon_treatment_detail: v ? value.salon_treatment_detail : null,
                    });
                  else onChange({ [row.key]: v } as Partial<Habits>);
                }}
              />
              </div>
            </div>
            )}

            {/*
              The one follow-up that CANNOT merge: a free-text box is not an option in a row
              of buttons. Salon treatments keeps its two stages for that reason, and so does
              Q14's side-effect description.
            */}
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

/** One row of the table: its label, and whatever control answers it. */
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3.5 desk:p-4">
      {children}
    </div>
  );
}

function RowLabel({ field, lang }: { field: string; lang: Lang }) {
  const l = LABELS[field];
  return (
    <div>
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
/**
 * A row of mutually exclusive options.
 *
 * Two things worth noting. It is a real `radiogroup`: the buttons always carried
 * `role="radio"`, but a radio outside a group is a role with nowhere to belong, and a screen
 * reader announces "1 of 3" only when the group is there to count them.
 *
 * And `labels` exists for the merged rows (see lib/apply.ts). Their first option is a
 * sentinel rather than a schema string, so it cannot go through `optionLabel` - that function
 * translates values the schema defines, and inventing an entry for "__negative__" would put a
 * UI token in the same table as clinical vocabulary.
 */
export function SegmentedRow({
  options,
  value,
  lang,
  onSelect,
  className,
  ariaLabel,
  labels,
  wrap = false,
}: {
  options: readonly string[];
  value: string | null;
  lang: Lang;
  onSelect: (v: string) => void;
  className?: string;
  /** What this set of options is asking. Required once the row has no visible column label. */
  ariaLabel?: string;
  /** Overrides for values that are not schema options. */
  labels?: Record<string, string>;
  /** Wrap onto a second line instead of scrolling sideways. */
  wrap?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "-mx-0.5 flex gap-1.5 px-0.5",
        wrap ? "flex-wrap" : "no-scrollbar overflow-x-auto",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onSelect(o)}
          className={cn(
            /*
              px-2.5, not px-3.5, and it was measured rather than eyeballed.

              At 390px the smoking row has 280px to work in, and "Moderate 5-10/day" plus
              "Severe >10/day" came to 282px - two pixels over, so they wrapped onto a line
              each and one row of four options became three ragged lines. Four pixels of
              padding per side brings the pair to 272px and the row to two even lines. The
              44px minimum height is untouched, which is what WCAG 2.5.8 actually asks for.
            */
            "min-h-[44px] shrink-0 rounded-xl border-2 px-2.5 text-[13px] font-semibold",
            "transition-colors active:scale-[0.97]",
            value === o
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-line bg-paper text-muted hover:border-brand/50 hover:bg-brand-soft/40 hover:text-ink",
          )}
        >
          {labels?.[o] ?? optionLabel(o, lang)}
        </button>
      ))}
    </div>
  );
}
