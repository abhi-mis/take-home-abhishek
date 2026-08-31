"use client";

/**
 * Q11 / Q12 / Q13 - the "software does the work" steps.
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
import { useMemo, useState } from "react";
import { INTAKE_SCHEMA } from "@/lib/schema";
import { PRODUCT_DUR, PRODUCT_ROWS, PROCEDURE_ROWS, SESSIONS } from "@/lib/types";
import type { Answers, Habits } from "@/lib/types";
import type { ExtractResult } from "@/lib/extractPrompt";
import { UI_COPY } from "@/lib/copy";
import { VoicePanel } from "./VoicePanel";
import { HabitsGrid } from "./HabitsGrid";
import { TableGrid, type ColumnSpec } from "./TableGrid";
import { FollowUpFlow } from "./FollowUpFlow";
import { outstandingFieldsFor, type OutstandingField } from "@/lib/followups";

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
  flowOpen,
  setFlowOpen,
}: {
  questionKey: "habits" | "products" | "procedures";
  answers: Answers;
  patch: (p: Partial<Answers>) => void;
  /**
   * Whether the guided follow-up flow is showing. Owned by the page rather than here,
   * because StepShell also needs to know: while the flow is running it hides its own
   * "still needed" summary, which would otherwise repeat the very list the flow is
   * walking the patient through.
   */
  flowOpen: boolean;
  setFlowOpen: (open: boolean) => void;
}) {
  const [justFilled, setJustFilled] = useState<string[]>([]);

  /**
   * Recomputed from the answers on every render, NOT from the model's `unfilled` list.
   * That matters: it means the flow shrinks as the patient answers (including answers
   * they give by tapping the grid directly), and it stays exactly in step with what
   * validateStep() is blocking Next on.
   */
  const outstanding: OutstandingField[] = useMemo(
    () => outstandingFieldsFor(questionKey, answers),
    [questionKey, answers],
  );

  /**
   * Merge, never replace. The model returns only fields the patient mentioned, so a
   * shallow spread over the existing value keeps earlier taps and lets the patient
   * record twice ("...and I also take biotin") without losing round one.
   */
  function apply(result: ExtractResult) {
    const p = result.patch;
    // Whatever the model left blank becomes the follow-up queue.
    setFlowOpen(true);

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

    // The model understood nothing usable - say so plainly and leave the grid alone.
    setJustFilled([]);
  }

  /**
   * Write one follow-up answer back into the store.
   *
   * Mirrors the grid's own edit rules exactly - in particular, answering a flag "No"
   * nulls that row's detail columns, so the "must be null when false" invariant in
   * validate.ts holds no matter which control the patient used.
   */
  function answerField(field: OutstandingField, value: boolean | string) {
    if (questionKey === "habits") {
      const p: Record<string, unknown> = { [field.field]: value };
      if (field.field === "smoking" && value === false) p.smoking_severity = null;
      if (field.field === "salon_treatments" && value === false) p.salon_treatment_detail = null;
      patch({ habits: { ...answers.habits, ...p } as Answers["habits"] });
      return;
    }

    const row = field.row;
    if (!row) return;
    const isProducts = questionKey === "products";
    const table = isProducts ? answers.products : answers.procedures;
    const flag = isProducts ? "used" : "done";
    const details = isProducts ? ["duration", "helped", "side_effects"] : ["sessions", "helped"];

    const current = (table as unknown as Record<string, Record<string, unknown>>)[row] ?? {};
    const cell: Record<string, unknown> = { ...current, [field.field]: value };
    if (field.field === flag && value === false) {
      for (const d of details) cell[d] = null;
    }

    const next = { ...(table as Record<string, unknown>), [row]: cell };
    patch(
      isProducts
        ? { products: next as Answers["products"] }
        : { procedures: next as Answers["procedures"] },
    );
  }

  return (
    <div>
      <VoicePanel questionKey={questionKey} onResult={apply} />

      {/*
        The layered-question answer: rather than listing what is missing and leaving the
        patient to hunt through collapsed rows, each gap is asked as its own full-size
        question, one at a time.
      */}
      {flowOpen ? (
        <FollowUpFlow
          fields={outstanding}
          onAnswer={answerField}
          onClose={() => setFlowOpen(false)}
        />
      ) : outstanding.length > 0 ? (
        <button
          type="button"
          onClick={() => setFlowOpen(true)}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-brand/35 bg-brand-soft/50 px-4 py-3 text-left transition-colors hover:bg-brand-soft"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-white tabular-nums">
            {outstanding.length}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold leading-snug text-brand-ink">
              Answer the remaining {outstanding.length} one at a time
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-muted">
              Quicker than finding them in the list below
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-brand">
            →
          </span>
        </button>
      ) : justFilled.length > 0 ? (
        <p className="mb-3 text-[13px] font-medium text-brand-ink">{UI_COPY.confirmHint}</p>
      ) : null}

      {/*
        While the flow is open the grid is hidden. Showing both meant the patient saw
        "Do you smoke?" twice on one screen - once in the focused card and again in the
        row underneath, which is exactly the kind of duplication that makes a form feel
        like it was assembled rather than designed. Closing the flow brings the grid
        straight back, with the voice highlights intact.
      */}
      {flowOpen ? null : questionKey === "habits" ? (
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
      {flowOpen ? null : (
        <p className="mt-4 text-[11px] text-muted/70">
          {rowCount(questionKey)} rows from the intake schema.
        </p>
      )}
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

