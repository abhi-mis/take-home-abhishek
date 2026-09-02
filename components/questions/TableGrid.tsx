"use client";

/**
 * Q12 products and Q13 procedures - one component, because the schema gives them the same
 * shape: rows x columns where the first column is a boolean flag and the rest only exist when
 * that flag is true.
 *
 * A real HTML table at 380px is unusable, so each row is a card.
 *
 * THE FLAG IS NOT ASKED SEPARATELY. It used to be: a Yes/No, and then, once you said Yes, a
 * revealed "how long?" with three options. Two stages for one fact, and the first stage told
 * nobody anything - a patient who picks "3-6mo" has obviously used the thing. The row now
 * opens as one line of options with the negative among them:
 *
 *   [ Never ][ <3mo ][ 3-6mo ][ >6mo ]
 *
 * Picking a duration writes `used: true` alongside it; picking Never writes `used: false` and
 * nulls every detail column. The mapping is in `lib/apply.ts` and the emitted JSON is
 * unchanged - see the note at the top of that file.
 *
 * What still unfolds is the columns that are genuinely separate questions: "did it help" and
 * "any side effects" are not points on the duration scale, and collapsing them in would mean
 * inventing combinations the schema does not have.
 */
import { AnimatePresence, motion } from "framer-motion";
import { cn, tick } from "@/lib/utils";
import { optionLabel, t, type Lang } from "@/lib/i18n";
import {
  NEGATIVE,
  mergedIsPositive,
  mergedOptions,
  mergedPatch,
  mergedSelection,
  type MergedSpec,
} from "@/lib/apply";
import {
  OPTION_ROW,
  OPTION_ROW_CONTROL_NARROW,
  OPTION_ROW_LABEL,
  SegmentedRow,
} from "./HabitsGrid";
import { YesNo } from "./YesNo";

export interface ColumnSpec {
  key: string;
  label: string;
  kind: "yesno" | "options";
  options?: readonly string[];
}

export interface TableGridProps {
  rows: readonly string[];
  lang: Lang;
  /** Which flag and which option column this table merges into one row. */
  merged: MergedSpec;
  /** What that merged row is asking, for the radiogroup's accessible name. */
  mergedLabel: string;
  /** The columns that still unfold: the ones that are their own question. */
  detailColumns: readonly ColumnSpec[];
  value: Record<string, Record<string, unknown>>;
  onChangeRow: (row: string, patch: Record<string, unknown>) => void;
  rowGloss?: Record<string, string>;
}

export function TableGrid({
  rows,
  lang,
  merged,
  mergedLabel,
  detailColumns,
  value,
  onChangeRow,
  rowGloss,
}: TableGridProps) {
  const options = mergedOptions(merged);
  // The sentinel is a UI token, so its label comes from the dictionary rather than from
  // `optionLabel`, which translates values the schema defines.
  const labels = { [NEGATIVE]: t("optNever", lang) };

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const entry = value[row] ?? {};
        const on = mergedIsPositive(entry, merged);
        const selected = mergedSelection(entry, merged);

        return (
          <div
            key={row}
            className={cn(
              "overflow-hidden rounded-2xl border p-3.5",
              on ? "border-brand/35 bg-card" : "border-line bg-card",
            )}
          >
            {/*
              Beside the label when the options fit, on their own line when they do not.

              Both fixed rules were wrong. Options on a dedicated line cost every UNANSWERED
              row an extra 35px, and there are fourteen of them across the two tables - the
              first version of this control measured 470px TALLER overall than the two-stage
              one it replaced, because the old collapsed row was just a label and a Yes/No.
              Forcing them beside the label instead overflows a 320px phone.

              `flex-wrap` decides per row and per viewport without a rule to get wrong: the
              options take the same line while there is room for them, and drop below when
              there is not. "Never <3mo 3-6mo >6mo" fits on a desktop; "Moderate 5-10/day"
              and its siblings do not, and wrap on their own.
            */}
            {/* The same control column the habits grid uses - see OPTION_ROW there. */}
            <div className={OPTION_ROW}>
              <div className={OPTION_ROW_LABEL}>
                <p className="text-[14.5px] font-semibold leading-tight text-ink">
                  {optionLabel(row, lang)}
                </p>
                {rowGloss?.[row] ? (
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{rowGloss[row]}</p>
                ) : null}
              </div>
              <SegmentedRow
                wrap
                className={OPTION_ROW_CONTROL_NARROW}
                ariaLabel={`${optionLabel(row, lang)}: ${mergedLabel}`}
                options={options}
                labels={labels}
                lang={lang}
                value={selected}
                onSelect={(v) => {
                  tick();
                  onChangeRow(row, mergedPatch(merged, v));
                }}
              />
            </div>

            <AnimatePresence initial={false}>
              {on ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {/*
                    The follow-ups are PAIRS, packed left - not rows in the wide column.

                    They inherited the 430px control column from the row above, and inside a
                    half-width flex child that column stretched: the label went hard left, the
                    Yes/No went hard right, and "DID IT HELP?" ended up a third of a card away
                    from the buttons that answer it. Two short questions reading as four
                    scattered pieces.

                    Each is now label-then-control on one line at its natural width, and the
                    pair of them sits together with a fixed gap. They belong to the row above,
                    so they read as its detail rather than as two more questions.
                  */}
                  <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3 desk:flex-row desk:flex-wrap desk:gap-x-9 desk:gap-y-3">
                    {detailColumns.map((col) => {
                      return (
                        <div
                          key={col.key}
                          /*
                            Stacked on a phone, inline on a desktop.

                            The pair is about 276px and a 320px phone leaves 209px inside the
                            row card, so something has to give. Letting it wrap on its own was
                            the first attempt and it produced a ragged card at 390px: "did it
                            help" fitted on one line and "any side effects" - two words longer -
                            did not, so two identical controls sat in two different shapes
                            beside each other. Deciding it by breakpoint instead means both
                            pairs always agree.
                          */
                          className="row-split flex flex-col items-start gap-1.5 desk:flex-row desk:shrink-0 desk:items-center desk:gap-2.5"
                        >
                          {/*
                            The label, and nothing appended to it. It used to read
                            `{col.label} · REQUIRED` while unanswered, which moved every
                            control on the row sideways the moment the answer landed - text
                            appearing and disappearing inside a flex row is a layout shift by
                            construction. Nothing is required to move on any more either, so
                            the word was also no longer true.
                          */}
                          <p className="shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                            {col.label}
                          </p>
                          <div className="row-control shrink-0">
                            {col.kind === "yesno" ? (
                              <YesNo
                                size="sm"
                                lang={lang}
                                value={(entry[col.key] as boolean | null) ?? null}
                                onChange={(v) => onChangeRow(row, { [col.key]: v })}
                              />
                            ) : (
                              <SegmentedRow
                                ariaLabel={col.label}
                                options={col.options ?? []}
                                lang={lang}
                                value={(entry[col.key] as string | null) ?? null}
                                onSelect={(v) => onChangeRow(row, { [col.key]: v })}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
