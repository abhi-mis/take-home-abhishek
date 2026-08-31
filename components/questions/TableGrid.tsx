"use client";

/**
 * Q12 products and Q13 procedures - one component, because the schema gives them the
 * same shape: rows x columns where the first column is a boolean flag and the rest
 * only exist when that flag is true.
 *
 * A real HTML table at 380px is unusable, so each row is a card that starts collapsed
 * as a single yes/no and expands its detail columns only when switched on. A patient
 * who uses one product answers 4 fields; a patient who uses none answers 5 taps and
 * is done. That is the whole reason this is not rendered as a grid.
 */
import { AnimatePresence, motion } from "framer-motion";
import { cn, tick } from "@/lib/utils";
import { SegmentedRow } from "./HabitsGrid";
import { YesNo } from "./YesNo";

export interface ColumnSpec {
  key: string;
  label: string;
  kind: "yesno" | "options";
  options?: readonly string[];
}

export interface TableGridProps {
  rows: readonly string[];
  /** The boolean column that gates the rest ("used" or "done"). */
  flagKey: string;
  flagLabel: string;
  detailColumns: readonly ColumnSpec[];
  value: Record<string, Record<string, unknown>>;
  onChangeRow: (row: string, patch: Record<string, unknown>) => void;
  /** Rows the model just wrote, for the confirm highlight. */
  justFilled?: string[];
  rowGloss?: Record<string, string>;
}

export function TableGrid({
  rows,
  flagKey,
  flagLabel,
  detailColumns,
  value,
  onChangeRow,
  justFilled = [],
  rowGloss,
}: TableGridProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const entry = value[row] ?? {};
        const on = entry[flagKey] === true;
        const highlighted = justFilled.includes(row);

        return (
          <div
            key={row}
            className={cn(
              "relative overflow-hidden rounded-2xl border p-3.5",
              on ? "border-brand/35 bg-card" : "border-line bg-card",
            )}
          >
            {/* Theme-inheriting "just filled" flash - see globals.css .flash-fill. */}
            {highlighted ? (
              <span
                aria-hidden
                className="flash-fill pointer-events-none absolute inset-0 bg-brand-soft"
              />
            ) : null}
            <div className="relative flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold leading-tight text-ink">{row}</p>
                {rowGloss?.[row] ? (
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{rowGloss[row]}</p>
                ) : null}
              </div>
              <div className="w-[124px] shrink-0">
                <YesNo
                  size="sm"
                  value={(entry[flagKey] as boolean | null) ?? null}
                  yesLabel={flagLabel}
                  noLabel="No"
                  onChange={(v) => {
                    tick();
                    // Switching a row off nulls every detail column, keeping the
                    // "must be null when false" invariant true at all times.
                    if (v) onChangeRow(row, { [flagKey]: true });
                    else
                      onChangeRow(row, {
                        [flagKey]: false,
                        ...Object.fromEntries(detailColumns.map((c) => [c.key, null])),
                      });
                  }}
                />
              </div>
            </div>

            <AnimatePresence initial={false}>
              {on ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="relative overflow-hidden"
                >
                  <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                    {detailColumns.map((col) => {
                      const missing = entry[col.key] === null || entry[col.key] === undefined;
                      return (
                        <div key={col.key}>
                          <p
                            className={cn(
                              "mb-1.5 text-[12px] font-semibold uppercase tracking-wide",
                              missing ? "text-warn" : "text-muted",
                            )}
                          >
                            {col.label}
                            {missing ? " · required" : ""}
                          </p>
                          {col.kind === "yesno" ? (
                            <YesNo
                              size="sm"
                              value={(entry[col.key] as boolean | null) ?? null}
                              onChange={(v) => onChangeRow(row, { [col.key]: v })}
                            />
                          ) : (
                            <SegmentedRow
                              options={col.options ?? []}
                              value={(entry[col.key] as string | null) ?? null}
                              onSelect={(v) => onChangeRow(row, { [col.key]: v })}
                            />
                          )}
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
