/**
 * Writing answers back into the store - the rules, in one place.
 *
 * Both modes now write the same answers: the form's grids and follow-up flow, and the
 * chat's replies. The rules that make an answer VALID are clinical, not cosmetic:
 *
 *   - a flag answered "No" must null its detail columns, or validate.ts's
 *     "detail must be null when the flag is false" invariant breaks and the downloaded
 *     JSON is off-schema;
 *   - an extraction merges into existing answers, never replaces them, so a second
 *     reply that mentions one more product does not erase the first four;
 *   - "None"/"No known family history" is exclusive.
 *
 * Those rules used to live inside VoiceMatrix. Two callers means one definition, or the
 * chat and the form will eventually disagree about what a valid answer is - and the
 * disagreement would surface as a schema-invalid download, which is the one output
 * nobody is allowed to get wrong. These are pure functions so they are unit-testable
 * without React.
 */
import type { OutstandingField } from "./followups";
import type { ExtractResult } from "./extractPrompt";
import {
  EMPTY_HABITS,
  EMPTY_PROCEDURE,
  EMPTY_PRODUCT,
  EXCLUSIVE_OPTIONS,
  PROCEDURE_ROWS,
  PRODUCT_ROWS,
  type Answers,
  type Habits,
  type PatientSex,
} from "./types";

/**
 * A store update, expressed as data.
 *
 * `none` carries "the patient actively said none of these" for the two multi-selects
 * whose schema has no such option - it maps to `chooseNone()`, not to `patch()`, so a
 * deliberate empty answer stays distinguishable from an unanswered one.
 */
export interface Ops {
  patch?: Partial<Answers>;
  sex?: PatientSex;
  none?: string[];
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
  const none = result.none && result.none.length > 0 ? result.none : undefined;

  if (questionKey === "habits" && p.habits) {
    return { patch: { habits: { ...answers.habits, ...(p.habits as Partial<Habits>) } }, none };
  }
  if (questionKey === "products" && p.products) {
    return {
      patch: { products: mergeRows(answers.products, p.products as Partial<Answers["products"]>) },
      none,
    };
  }
  if (questionKey === "procedures" && p.procedures) {
    return {
      patch: {
        procedures: mergeRows(answers.procedures, p.procedures as Partial<Answers["procedures"]>),
      },
      none,
    };
  }

  // Single-answer questions: the slice returns exactly the one key it owns.
  const patch = { ...p };
  const exclusive = EXCLUSIVE_OPTIONS[questionKey];
  const picked = patch[questionKey as "family_history"];
  if (exclusive !== undefined && Array.isArray(picked) && picked.includes(exclusive)) {
    // Exclusive means exclusive, whichever route filled it in.
    (patch as Record<string, unknown>)[questionKey] = [exclusive];
  }
  return Object.keys(patch).length > 0 ? { patch, none } : { none };
}

/**
 * One follow-up field -> store ops.
 *
 * This is where the "No nulls its details" invariant lives. It fires for the grid, the
 * follow-up flow, and the chat identically, so the invariant cannot hold in one mode
 * and fail in another.
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

/**
 * Wipe one question back to unanswered.
 *
 * Needed because chat mode asks "is that right?" after a reply fills several fields at
 * once, and "no" has to mean something. Clearing and re-asking is the honest response:
 * keeping a fill the patient just rejected, or asking them to correct fields one by one
 * without knowing which one is wrong, both end with a wrong answer in the output.
 */
export function clearQuestionOps(questionKey: string, answers: Answers): Ops {
  if (questionKey === "habits") return { patch: { habits: { ...EMPTY_HABITS } } };
  if (questionKey === "products") {
    return {
      patch: {
        products: Object.fromEntries(
          PRODUCT_ROWS.map((r) => [r, { ...EMPTY_PRODUCT }]),
        ) as Answers["products"],
      },
    };
  }
  if (questionKey === "procedures") {
    return {
      patch: {
        procedures: Object.fromEntries(
          PROCEDURE_ROWS.map((r) => [r, { ...EMPTY_PROCEDURE }]),
        ) as Answers["procedures"],
      },
    };
  }
  if (questionKey === "past_treatment_side_effects") {
    return { patch: { past_treatment_side_effects: null, past_treatment_describe: null } };
  }
  const empty = Array.isArray(answers[questionKey as "family_history"]) ? [] : null;
  return { patch: { [questionKey]: empty } as unknown as Partial<Answers> };
}
