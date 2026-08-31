"use client";

/**
 * Q11 / Q12 / Q13 — the "software does the work" steps.
 *
 * Flow: mic -> /api/transcribe -> /api/extract (one schema slice) -> patch the store
 * -> the grid below re-renders with those rows highlighted -> the patient confirms or
 * corrects by tapping -> Next.
 *
 * The grid is ALWAYS mounted, before and after recording. That is the tap fallback:
 * there is no separate "manual mode" to switch into, so a mic denial, a dead API key
 * or a patient who simply prefers tapping all land in exactly the same UI.
 *
 * `justFilled` is derived by diffing the patch against what was there, so the
 * highlight marks what the model actually changed rather than everything it returned.
 */
import { useState } from "react";
import { INTAKE_SCHEMA } from "@/lib/schema";
import { PRODUCT_DUR, PRODUCT_ROWS, PROCEDURE_ROWS, SESSIONS } from "@/lib/types";
import type { Answers, Habits } from "@/lib/types";
import type { ExtractResult } from "@/lib/extractPrompt";
import { UI_COPY } from "@/lib/copy";
import { VoicePanel } from "./VoicePanel";
import { HabitsGrid } from "./HabitsGrid";
import { TableGrid, type ColumnSpec } from "./TableGrid";

const PRODUCT_COLUMNS: ColumnSpec[] = [
  { key: "duration", label: "How long", kind: "options", options: PRODUCT_DUR },
  { key: "helped", label: "Did it help?", kind: "yesno" },
  { key: "side_effects", label: "Any side effects?", kind: "yesno" },
];

const PROCEDURE_COLUMNS: ColumnSpec[] = [
  { key: "sessions", label: "How many sessions", kind: "options", options: SESSIONS },
  { key: "helped", label: "Did it help?", kind: "yesno" },
];

const PRODUCT_GLOSS: Record<string, string> = {
  "OTC/Medicated Shampoos": "Anti-dandruff or medicated shampoo",
  "Hair Oils/Serums": "Oils or leave-in serums",
  "Topical Minoxidil": "The solution or foam you apply",
  "Oral Minoxidil": "Minoxidil tablets",
  Supplements: "Biotin, vitamins, iron",
};

const PROCEDURE_GLOSS: Record<string, string> = {
  "PRP/GFC/iPRF": "Injections made from your own blood",
  "Stem Cells/Exosomes": "Stem cell or exosome therapy",
  "Hair Transplant": "Transplant surgery",
  Other: "Any other clinic treatment",
};

export function VoiceMatrix({
  questionKey,
  answers,
  patch,
}: {
  questionKey: "habits" | "products" | "procedures";
  answers: Answers;
  patch: (p: Partial<Answers>) => void;
}) {
  const [justFilled, setJustFilled] = useState<string[]>([]);
  const [gaps, setGaps] = useState<string[]>([]);

  /**
   * Merge, never replace. The model returns only fields the patient mentioned, so a
   * shallow spread over the existing value keeps earlier taps and lets the patient
   * record twice ("...and I also take biotin") without losing round one.
   */
  function apply(result: ExtractResult) {
    const p = result.patch;
    setGaps(result.unfilled);

    if (questionKey === "habits" && p.habits) {
      const incoming = p.habits as Partial<Habits>;
      setJustFilled(Object.keys(incoming));
      patch({ habits: { ...answers.habits, ...incoming } });
      return;
    }

    if (questionKey === "products" && p.products) {
      const incoming = p.products as Partial<Answers["products"]>;
      setJustFilled(Object.keys(incoming));
      patch({
        products: mergeRows(answers.products, incoming),
      });
      return;
    }

    if (questionKey === "procedures" && p.procedures) {
      const incoming = p.procedures as Partial<Answers["procedures"]>;
      setJustFilled(Object.keys(incoming));
      patch({
        procedures: mergeRows(answers.procedures, incoming),
      });
      return;
    }

    // The model understood nothing usable — say so plainly and leave the grid alone.
    setJustFilled([]);
  }

  return (
    <div>
      <VoicePanel questionKey={questionKey} onResult={apply} />

      {justFilled.length > 0 ? (
        <p className="mb-3 text-[13px] font-medium text-brand-ink">{UI_COPY.confirmHint}</p>
      ) : null}

      {gaps.length > 0 ? (
        <p className="mb-3 rounded-xl border border-dashed border-warn/50 bg-warn/5 px-3 py-2 text-[12.5px] leading-snug text-warn">
          Not mentioned — please tap these: {gaps.map(prettyGap).join(", ")}
        </p>
      ) : null}

      {questionKey === "habits" ? (
        <HabitsGrid
          value={answers.habits}
          justFilled={justFilled}
          onChange={(p) => patch({ habits: { ...answers.habits, ...p } })}
        />
      ) : questionKey === "products" ? (
        <TableGrid
          rows={PRODUCT_ROWS}
          flagKey="used"
          flagLabel="Yes"
          detailColumns={PRODUCT_COLUMNS}
          rowGloss={PRODUCT_GLOSS}
          justFilled={justFilled}
          value={answers.products as unknown as Record<string, Record<string, unknown>>}
          onChangeRow={(row, p) =>
            patch({
              products: {
                ...answers.products,
                [row]: { ...answers.products[row as keyof Answers["products"]], ...p },
              } as Answers["products"],
            })
          }
        />
      ) : (
        <TableGrid
          rows={PROCEDURE_ROWS}
          flagKey="done"
          flagLabel="Yes"
          detailColumns={PROCEDURE_COLUMNS}
          rowGloss={PROCEDURE_GLOSS}
          justFilled={justFilled}
          value={answers.procedures as unknown as Record<string, Record<string, unknown>>}
          onChangeRow={(row, p) =>
            patch({
              procedures: {
                ...answers.procedures,
                [row]: { ...answers.procedures[row as keyof Answers["procedures"]], ...p },
              } as Answers["procedures"],
            })
          }
        />
      )}

      {/* Sanity check that the rendered rows come from the schema, not a local list. */}
      <p className="mt-4 text-[11px] text-muted/70">
        {rowCount(questionKey)} rows from the intake schema.
      </p>
    </div>
  );
}

/**
 * Shallow-merge the rows the model returned into the rows already in the store.
 * Generic over the row key and entry type, so products and procedures share it
 * without either side losing its literal row-name union.
 */
function mergeRows<K extends string, E extends object>(
  current: Record<K, E>,
  incoming: Partial<Record<K, Partial<E>>>,
): Record<K, E> {
  const out = { ...current };
  for (const [row, cell] of Object.entries(incoming) as [K, Partial<E> | undefined][]) {
    if (!cell) continue;
    out[row] = { ...current[row], ...cell };
  }
  return out;
}

function rowCount(key: "habits" | "products" | "procedures"): number {
  if (key === "habits") return INTAKE_SCHEMA.sections[2].questions[1].rows.length;
  if (key === "products") return PRODUCT_ROWS.length;
  return PROCEDURE_ROWS.length;
}

/** "Hair Oils/Serums.duration" -> "Hair Oils/Serums — kitne time se" */
function prettyGap(path: string): string {
  const [head, tail] = path.split(".");
  if (!tail) return head ?? path;
  const label =
    PRODUCT_COLUMNS.find((c) => c.key === tail)?.label ??
    PROCEDURE_COLUMNS.find((c) => c.key === tail)?.label ??
    tail.replace(/_/g, " ");
  return head === "habits" ? label : `${head} — ${label}`;
}
