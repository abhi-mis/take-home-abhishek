/**
 * Writing answers back into the store - the rules, in one place.
 *
 * Three different controls write these answers: the grids, the guided follow-up flow, and
 * a voice fill. The rules that make an answer VALID are clinical, not cosmetic:
 *
 *   - a flag answered "No" must null its detail columns, or validate.ts's
 *     "detail must be null when the flag is false" invariant breaks and the downloaded
 *     JSON is off-schema;
 *   - an extraction merges into existing answers, never replaces them, so a second
 *     reply that mentions one more product does not erase the first four.
 *
 * Those rules used to live inside VoiceMatrix, next to the JSX. Pulling them out is what
 * makes them testable without React - and a schema-invalid download is the one output
 * nobody is allowed to get wrong, so it deserves tests that do not need a browser.
 */
import type { OutstandingField } from "./followups";
import type { ExtractResult } from "./extractPrompt";
import {
  PROCEDURE_ROWS,
  PRODUCT_ROWS,
  type Answers,
  type Habits,
  type PatientSex,
} from "./types";

/** A store update, expressed as data rather than applied - so it can be asserted. */
export interface Ops {
  patch?: Partial<Answers>;
  sex?: PatientSex;
}

/**
 * Merge incoming table rows into existing ones, per row rather than per table.
 *
 * Generic over both tables because products and procedures differ only in their column
 * names; a shallow `{...current, ...incoming}` would drop the columns a partial row
 * omits, which is exactly what an extraction produces.
 */
export function mergeRows<K extends string, E extends object>(
  current: Record<K, E>,
  incoming: Partial<Record<K, Partial<E>>>,
): Record<K, E> {
  const out = { ...current };
  for (const [row, cell] of Object.entries(incoming) as [K, Partial<E>][]) {
    if (!cell) continue;
    out[row] = { ...current[row], ...cell };
  }
  return out;
}

const PRODUCT_DETAILS = ["duration", "helped", "side_effects"] as const;
const PROCEDURE_DETAILS = ["sessions", "helped"] as const;

function isProductRow(row: string): boolean {
  return (PRODUCT_ROWS as readonly string[]).includes(row);
}
function isProcedureRow(row: string): boolean {
  return (PROCEDURE_ROWS as readonly string[]).includes(row);
}

/**
 * An extraction result -> store ops.
 *
 * The three table questions merge; every other question is a plain assignment. Note
 * that `result.patch` is already schema-filtered by the slice, so this function's only
 * job is the merge strategy.
 */
export function extractOps(
  questionKey: string,
  result: ExtractResult,
  answers: Answers,
): Ops {
  const p = result.patch;

  if (questionKey === "habits" && p.habits) {
    return { patch: { habits: { ...answers.habits, ...(p.habits as Partial<Habits>) } } };
  }
  if (questionKey === "products" && p.products) {
    return {
      patch: { products: mergeRows(answers.products, p.products as Partial<Answers["products"]>) },
    };
  }
  if (questionKey === "procedures" && p.procedures) {
    return {
      patch: {
        procedures: mergeRows(answers.procedures, p.procedures as Partial<Answers["procedures"]>),
      },
    };
  }

  // Q14 and anything else single-valued: the slice returns exactly the keys it owns.
  return Object.keys(p).length > 0 ? { patch: { ...p } } : {};
}

/**
 * One follow-up field -> store ops.
 *
 * This is where the "No nulls its details" invariant lives. The grid and the guided
 * follow-up flow both come through here, so a row answered in one cannot end up shaped
 * differently from the same row answered in the other.
 */
export function fieldOps(
  questionKey: string,
  field: OutstandingField,
  value: boolean | string,
  answers: Answers,
): Ops {
  if (questionKey === "habits" || field.path.startsWith("habits.")) {
    const p: Record<string, unknown> = { [field.field]: value };
    if (field.field === "smoking" && value === false) p.smoking_severity = null;
    if (field.field === "salon_treatments" && value === false) p.salon_treatment_detail = null;
    return { patch: { habits: { ...answers.habits, ...p } as Habits } };
  }

  if (field.path === "past_treatment_describe") {
    return { patch: { past_treatment_describe: String(value) } };
  }

  const row = field.row;
  if (!row) return {};

  if (isProductRow(row)) {
    const current = answers.products[row as keyof Answers["products"]];
    const cell: Record<string, unknown> = { ...current, [field.field]: value };
    if (field.field === "used" && value === false) for (const d of PRODUCT_DETAILS) cell[d] = null;
    return {
      patch: {
        products: { ...answers.products, [row]: cell } as Answers["products"],
      },
    };
  }

  if (isProcedureRow(row)) {
    const current = answers.procedures[row as keyof Answers["procedures"]];
    const cell: Record<string, unknown> = { ...current, [field.field]: value };
    if (field.field === "done" && value === false) for (const d of PROCEDURE_DETAILS) cell[d] = null;
    return {
      patch: {
        procedures: { ...answers.procedures, [row]: cell } as Answers["procedures"],
      },
    };
  }

  return {};
}
