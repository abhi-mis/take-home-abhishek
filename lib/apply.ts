/**
 * Writing answers back into the store - the rules, in one place.
 *
 * The rule everything here exists to protect is clinical, not cosmetic: a flag answered No
 * must null its detail columns. `validate.ts` enforces "detail must be null when the flag is
 * false", so getting this wrong produces an off-schema download, which is the one output
 * nobody is allowed to get wrong. That is why the rules live in a module with no React in it
 * and tests that need no browser.
 *
 * MERGED CHOICES
 *
 * Several questions in the schema are a boolean gating an option list: "do you smoke?" then
 * "how much?", "have you used this?" then "for how long?". Asked literally that is two stages
 * and two taps for one fact, and the first stage carries no information the second does not -
 * nobody picks "Mild <5/day" without smoking.
 *
 * So the control is one row: the negative option sits alongside the positive ones.
 *
 *   before   [ Yes ][ No ]   then, revealed   [ Mild ][ Moderate ][ Severe ]
 *   after    [ No ][ Mild <5/day ][ Moderate 5-10/day ][ Severe >10/day ]
 *
 * THE JSON DOES NOT CHANGE. This is a presentation merge, and the mapping back to the
 * schema's own shape is the whole content of this file: picking "Mild <5/day" writes
 * `{ smoking: true, smoking_severity: "Mild <5/day" }` and picking No writes
 * `{ smoking: false, smoking_severity: null }` - exactly the two states the two-stage version
 * produced. `lib/schema.ts`, `lib/types.ts` and the emitted output are untouched.
 *
 * It does not apply everywhere, and the exception is worth naming: `salon_treatment_detail`
 * and `past_treatment_describe` are free text, and a text box cannot be an option in a row of
 * buttons. Those two stay two-stage.
 */
import { PROCEDURE_ROWS, PRODUCT_ROWS, PRODUCT_DUR, SESSIONS, SMOKING_SEV } from "./types";

/**
 * The negative option's value.
 *
 * A sentinel rather than "No", because the real options are schema strings and this one is
 * not: it must never be mistaken for a value that could be written to an answer. Everything
 * that reads it maps it to `false` before the store sees it.
 */
export const NEGATIVE = "__negative__";

export interface MergedSpec {
  /** The boolean column the negative option writes `false` to. */
  flag: string;
  /** The option column the positive choices write to. */
  detail: string;
  /**
   * Other columns that must go null when the flag goes false.
   *
   * They are NOT part of this control - "did it help" is a separate clinical fact and gets
   * its own row - but they are part of the same invariant, so the list lives with the rule.
   */
  alsoNull: readonly string[];
  options: readonly string[];
}

/** Q11, the smoking row: one boolean, one severity scale, nothing else. */
export const SMOKING_MERGED: MergedSpec = {
  flag: "smoking",
  detail: "smoking_severity",
  alsoNull: [],
  options: SMOKING_SEV,
};

/** Q12, every product row: used + how long, with helped and side effects following. */
export const PRODUCT_MERGED: MergedSpec = {
  flag: "used",
  detail: "duration",
  alsoNull: ["helped", "side_effects"],
  options: PRODUCT_DUR,
};

/** Q13, every treatment row: done + how many sessions, with helped following. */
export const PROCEDURE_MERGED: MergedSpec = {
  flag: "done",
  detail: "sessions",
  alsoNull: ["helped"],
  options: SESSIONS,
};

/** The options a merged row renders, negative first. */
export function mergedOptions(spec: MergedSpec): string[] {
  return [NEGATIVE, ...spec.options];
}

/**
 * What the row shows as selected: an option string, NEGATIVE, or null for unanswered.
 *
 * `flag === true` with an empty detail returns null - nothing selected - which is the honest
 * reading of a half-answered row. Tapping cannot produce that state, but a session persisted
 * before this control existed can, and so can a future edit; a row that is incomplete should
 * look incomplete rather than pick a button for the patient.
 */
export function mergedSelection(
  entry: Record<string, unknown> | undefined,
  spec: MergedSpec,
): string | null {
  if (entry === undefined) return null;
  if (entry[spec.flag] === false) return NEGATIVE;
  if (entry[spec.flag] === true) {
    const detail = entry[spec.detail];
    return typeof detail === "string" && detail.length > 0 ? detail : null;
  }
  return null;
}

/**
 * The patch for one tap on a merged row.
 *
 * The negative branch nulls the detail AND everything in `alsoNull`, which is the invariant.
 * The positive branch deliberately does NOT touch `alsoNull`: switching from "<3mo" to "3-6mo"
 * must not wipe an already-answered "did it help".
 */
export function mergedPatch(spec: MergedSpec, choice: string): Record<string, unknown> {
  if (choice === NEGATIVE) {
    const out: Record<string, unknown> = { [spec.flag]: false, [spec.detail]: null };
    for (const key of spec.alsoNull) out[key] = null;
    return out;
  }
  return { [spec.flag]: true, [spec.detail]: choice };
}

/** True while the row's remaining follow-up columns should be on screen. */
export function mergedIsPositive(
  entry: Record<string, unknown> | undefined,
  spec: MergedSpec,
): boolean {
  return entry !== undefined && entry[spec.flag] === true;
}

export function isProductRow(row: string): boolean {
  return (PRODUCT_ROWS as readonly string[]).includes(row);
}

export function isProcedureRow(row: string): boolean {
  return (PROCEDURE_ROWS as readonly string[]).includes(row);
}
