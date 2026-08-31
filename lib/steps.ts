/**
 * Schema -> ordered step list, plus PER-STEP VALIDATION.
 *
 * One step per schema question, plus one synthetic SexGate step inserted directly
 * before section B (the section that holds the two femaleOnly questions).
 *
 * Visibility is COMPUTED, never stored: `visibleSteps(meta)` re-derives the list on
 * every render, so a patient who changes their answer on the SexGate immediately
 * sees Q6/Q7 appear or disappear, and the progress bar retotals itself.
 *
 * `validateStep()` is the gate: it returns the list of things still outstanding on the
 * current step. Next stays disabled while that list is non-empty, and the UI prints it,
 * so nobody can skip a question and discover it at the end. lib/validate.ts applies the
 * same rules to the whole object, so the step gate and the final gate can never
 * disagree.
 */
import { QUESTIONS, type QuestionKey } from "./schema";
import {
  HABIT_YESNO_KEYS,
  PRODUCT_ROWS,
  PROCEDURE_ROWS,
  hasNoneEscape,
  type Answers,
  type Meta,
} from "./types";

export type StepKind =
  | "number"
  | "single"
  | "multi"
  | "yesno"
  | "yesno_describe"
  | "table"
  | "consent"
  | "sexgate";

export interface Step {
  /** Stable id used for routing, progress and the `explicitNone` set. */
  id: string;
  /** Schema question key, or null for the synthetic SexGate. */
  key: QuestionKey | null;
  kind: StepKind;
  sectionId: string;
  sectionTitle: string;
  /** Question number 1..16; null for the SexGate (it isn't a graded question). */
  n: number | null;
}

const SEX_GATE_STEP: Step = {
  id: "sex_gate",
  key: null,
  kind: "sexgate",
  sectionId: "B",
  sectionTitle: "Hormonal & Health Influences",
  n: null,
};

/** Q14 carries a conditional free-text followup; Q16 gets its own consent screen. */
function kindFor(q: (typeof QUESTIONS)[number]): StepKind {
  if (q.key === "consent") return "consent";
  if (q.key === "past_treatment_side_effects") return "yesno_describe";
  return q.type as StepKind;
}

/** All steps, gating ignored. Order is schema order. */
export const ALL_STEPS: Step[] = (() => {
  const out: Step[] = [];
  let gateInserted = false;
  for (const q of QUESTIONS) {
    // The gate must be answered before the first question of section B renders.
    if (!gateInserted && q.sectionId === "B") {
      out.push(SEX_GATE_STEP);
      gateInserted = true;
    }
    out.push({
      id: q.key,
      key: q.key,
      kind: kindFor(q),
      sectionId: q.sectionId,
      sectionTitle: q.sectionTitle,
      n: q.n,
    });
  }
  return out;
})();

/**
 * GATING RULE (also enforced in validate.ts):
 * patient_sex !== "female" -> menstrual_cycle and pregnancy_related are skipped
 * and stay null. That null is a VALID answer, not a missing one.
 */
export function isStepVisible(step: Step, meta: Meta): boolean {
  if (step.key === "menstrual_cycle" || step.key === "pregnancy_related") {
    return meta.patient_sex === "female";
  }
  return true;
}

export function visibleSteps(meta: Meta): Step[] {
  return ALL_STEPS.filter((s) => isStepVisible(s, meta));
}

export interface StepValidation {
  complete: boolean;
  /** Plain-English list of what is still outstanding, shown under the question. */
  outstanding: string[];
}

const OK: StepValidation = { complete: true, outstanding: [] };
const fail = (...outstanding: string[]): StepValidation => ({ complete: false, outstanding });

/** Human labels for the habit rows, so validation messages name the row. */
const HABIT_LABELS: Record<string, string> = {
  smoking: "Smoking",
  alcohol: "Alcohol",
  hard_water: "Hard water",
  heating_tools_styling_chemicals: "Heat or styling chemicals",
  salon_treatments: "Salon treatments",
};

/**
 * Everything a step needs before the patient may move on.
 *
 * Deliberately strict: there is no "skip". The only way to answer nothing on a
 * multi-select is to actively choose an exclusive option ("None") or, on the two
 * questions with no such option, the UI-only "None of these" control.
 */
export function validateStep(
  step: Step,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true> = {},
): StepValidation {
  switch (step.kind) {
    case "sexgate":
      return meta.patient_sex !== null ? OK : fail("Choose one option to continue");

    case "number":
      return answers.age_hair_loss_began !== null ? OK : fail("Pick an age range");

    case "single":
      return answers[step.key as "duration"] !== null ? OK : fail("Choose one option");

    case "yesno":
      return answers[step.key as "adult_acne_oily_skin"] !== null ? OK : fail("Choose Yes or No");

    case "consent":
      return answers.consent !== null
        ? OK
        : fail("Please choose Yes or No — nothing is selected for you");

    case "multi": {
      const key = step.key as "family_history";
      const selected = answers[key];
      if (selected.length > 0) return OK;
      if (hasNoneEscape(key) && explicitNone[key]) return OK;
      return fail(
        hasNoneEscape(key)
          ? "Select at least one, or choose “None of these”"
          : "Select at least one option",
      );
    }

    case "yesno_describe": {
      const v = answers.past_treatment_side_effects;
      if (v === null) return fail("Choose Yes or No");
      if (v === false) return OK;
      return (answers.past_treatment_describe ?? "").trim().length > 0
        ? OK
        : fail("Describe the side effect so your doctor knows what to avoid");
    }

    case "table":
      return validateTableStep(step.key, answers);
  }
}

/**
 * Q11/Q12/Q13. Every row must be answered, and any row answered "yes" must have its
 * detail columns filled. This is what stops a voice fill from leaving silent gaps.
 */
function validateTableStep(key: QuestionKey | null, answers: Answers): StepValidation {
  const outstanding: string[] = [];

  if (key === "habits") {
    for (const row of HABIT_YESNO_KEYS) {
      if (answers.habits[row] === null) outstanding.push(`${HABIT_LABELS[row]}: choose Yes or No`);
    }
    if (answers.habits.hair_wash_frequency === null)
      outstanding.push("Hair wash: choose how often");
    if (answers.habits.smoking === true && answers.habits.smoking_severity === null)
      outstanding.push("Smoking: choose how much");
    if (
      answers.habits.salon_treatments === true &&
      !(answers.habits.salon_treatment_detail ?? "").trim()
    )
      outstanding.push("Salon treatments: say which treatment");
    return outstanding.length === 0 ? OK : { complete: false, outstanding };
  }

  if (key === "products") {
    for (const row of PRODUCT_ROWS) {
      const e = answers.products[row];
      if (e.used === null) {
        outstanding.push(`${row}: choose Yes or No`);
        continue;
      }
      if (e.used === false) continue;
      if (e.duration === null) outstanding.push(`${row}: how long`);
      if (e.helped === null) outstanding.push(`${row}: did it help`);
      if (e.side_effects === null) outstanding.push(`${row}: any side effects`);
    }
    return outstanding.length === 0 ? OK : { complete: false, outstanding };
  }

  if (key === "procedures") {
    for (const row of PROCEDURE_ROWS) {
      const e = answers.procedures[row];
      if (e.done === null) {
        outstanding.push(`${row}: choose Yes or No`);
        continue;
      }
      if (e.done === false) continue;
      if (e.sessions === null) outstanding.push(`${row}: how many sessions`);
      if (e.helped === null) outstanding.push(`${row}: did it help`);
    }
    return outstanding.length === 0 ? OK : { complete: false, outstanding };
  }

  return OK;
}

/** Convenience wrapper kept for call sites that only need the boolean. */
export function isStepComplete(
  step: Step,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true> = {},
): boolean {
  return validateStep(step, answers, meta, explicitNone).complete;
}

export function stepIndexById(steps: Step[], id: string): number {
  const i = steps.findIndex((s) => s.id === id);
  return i === -1 ? 0 : i;
}
