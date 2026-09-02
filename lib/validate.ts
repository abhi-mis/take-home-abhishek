/**
 * Zod mirror of the Answers type + a coverage check.
 *
 * Two separate questions get answered here:
 *   1. SHAPE - is every value one of the schema's exact option strings, and are the
 *                 conditional followups present exactly when their trigger is true?
 *   2. COVERAGE - have all 16 questions been resolved? A sex-gated null counts as
 *                 resolved; an untouched multi-select does not.
 *
 * The Review screen only offers the download when both pass, so a half-filled form
 * can never leave the app.
 */
import { z } from "zod";
import {
  CONDITIONS,
  DURATION,
  FAMILY,
  MENSTRUAL,
  PAST6M,
  PATTERN,
  PREGNANCY,
  PRODUCT_DUR,
  PRODUCT_ROWS,
  PROCEDURE_ROWS,
  SAMPLE,
  SESSIONS,
  SMOKING_SEV,
  WASH,
  type Answers,
  type Meta,
} from "./types";
import { QUESTIONS } from "./schema";
import { ALL_STEPS, validateStep } from "./steps";

/** z.enum needs a mutable non-empty tuple; the schema gives us readonly arrays. */
const asTuple = <T extends readonly string[]>(a: T) => a as unknown as [string, ...string[]];
const optionOf = <T extends readonly string[]>(a: T) => z.enum(asTuple(a));

/**
 * Note the asymmetry with lib/types.ts: while filling, every yes/no is `boolean | null`
 * so "unanswered" is representable. Here they must be real booleans - a null is exactly
 * the unanswered case, and it must fail. That is how a nullable UI produces a
 * non-nullable output without a separate "final" type.
 */
const HabitsSchema = z
  .object({
    smoking: z.boolean(),
    smoking_severity: optionOf(SMOKING_SEV).nullable(),
    alcohol: z.boolean(),
    hard_water: z.boolean(),
    hair_wash_frequency: optionOf(WASH).nullable(),
    heating_tools_styling_chemicals: z.boolean(),
    salon_treatments: z.boolean(),
    salon_treatment_detail: z.string().min(1).nullable(),
  })
  .superRefine((h, ctx) => {
    // Conditional rule: severity exists if and only if smoking is true.
    if (h.smoking && h.smoking_severity === null)
      ctx.addIssue({ code: "custom", path: ["smoking_severity"], message: "required when smoking is true" });
    if (!h.smoking && h.smoking_severity !== null)
      ctx.addIssue({ code: "custom", path: ["smoking_severity"], message: "must be null when smoking is false" });
    if (h.salon_treatments && !h.salon_treatment_detail)
      ctx.addIssue({ code: "custom", path: ["salon_treatment_detail"], message: "required when salon_treatments is true" });
    if (!h.salon_treatments && h.salon_treatment_detail !== null)
      ctx.addIssue({ code: "custom", path: ["salon_treatment_detail"], message: "must be null when salon_treatments is false" });
    if (h.hair_wash_frequency === null)
      ctx.addIssue({ code: "custom", path: ["hair_wash_frequency"], message: "required" });
  });

const ProductEntrySchema = z
  .object({
    used: z.boolean(),
    duration: optionOf(PRODUCT_DUR).nullable(),
    helped: z.boolean().nullable(),
    side_effects: z.boolean().nullable(),
  })
  .superRefine((p, ctx) => {
    // duration / helped / side_effects are required iff used === true, else null.
    for (const f of ["duration", "helped", "side_effects"] as const) {
      if (p.used && p[f] === null)
        ctx.addIssue({ code: "custom", path: [f], message: "required when used is true" });
      if (!p.used && p[f] !== null)
        ctx.addIssue({ code: "custom", path: [f], message: "must be null when used is false" });
    }
  });

const ProcedureEntrySchema = z
  .object({
    done: z.boolean(),
    sessions: optionOf(SESSIONS).nullable(),
    helped: z.boolean().nullable(),
  })
  .superRefine((p, ctx) => {
    for (const f of ["sessions", "helped"] as const) {
      if (p.done && p[f] === null)
        ctx.addIssue({ code: "custom", path: [f], message: "required when done is true" });
      if (!p.done && p[f] !== null)
        ctx.addIssue({ code: "custom", path: [f], message: "must be null when done is false" });
    }
  });

/** Fixed-key record built from the schema row list, so an unknown row is an error. */
function recordOf<V extends z.ZodTypeAny>(keys: readonly string[], value: V) {
  return z.object(Object.fromEntries(keys.map((k) => [k, value])) as Record<string, V>).strict();
}

/** Multi-selects accept only exact schema options, no duplicates, exclusives honoured. */
function multiOf(options: readonly string[], exclusive?: string) {
  return z.array(optionOf(options)).superRefine((arr, ctx) => {
    if (new Set(arr).size !== arr.length)
      ctx.addIssue({ code: "custom", message: "duplicate options" });
    // An exclusive option cannot co-exist with any other choice.
    if (exclusive && arr.includes(exclusive) && arr.length > 1)
      ctx.addIssue({ code: "custom", message: exclusive + " is exclusive" });
  });
}

export const AnswersSchema = z.object({
  age_hair_loss_began: z.number().int().min(1).max(100).nullable(),
  duration: optionOf(DURATION).nullable(),
  family_history: multiOf(FAMILY, "No known family history"),
  pattern: multiOf(PATTERN),
  diagnosed_conditions: multiOf(CONDITIONS, "None"),
  menstrual_cycle: optionOf(MENSTRUAL).nullable(),
  pregnancy_related: optionOf(PREGNANCY).nullable(),
  adult_acne_oily_skin: z.boolean().nullable(),
  excess_body_facial_hair: z.boolean().nullable(),
  past_6_months: multiOf(PAST6M),
  habits: HabitsSchema,
  products: recordOf(PRODUCT_ROWS, ProductEntrySchema),
  procedures: recordOf(PROCEDURE_ROWS, ProcedureEntrySchema),
  past_treatment_side_effects: z.boolean().nullable(),
  past_treatment_describe: z.string().min(1).nullable(),
  sample_type: optionOf(SAMPLE).nullable(),
  consent: z.boolean().nullable(),
});

export interface ValidationResult {
  valid: boolean;
  /** Question keys with no resolved answer yet. */
  missing: string[];
  /** Shape / conditional-rule violations, as "path: message". */
  issues: string[];
}

/**
 * Coverage per question key, derived from the ANSWERS themselves rather than from which
 * screens were visited.
 *
 * This is the same rule set as validateStep() in lib/steps.ts - it reuses that function
 * so the per-step gate and the final gate cannot drift apart. `explicitNone` covers the
 * one case answers alone cannot express: a deliberately empty Q4/Q10.
 */
function isResolved(
  key: string,
  a: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): boolean {
  if (key === "menstrual_cycle" || key === "pregnancy_related") {
    /*
      A gated null is a resolved answer for a patient we know is not female. It is NOT a
      resolved answer while sex is unknown, and the difference matters more than it looks:
      this branch used to return true for `patient_sex === null`, so a patient who skipped
      the sex question could complete everything else and unlock the download - handing a
      doctor a file with `patient_sex: null` and two nulls beside it that could mean "does
      not apply" or "never asked". Unknown is not the same as not applicable.
    */
    if (meta.patient_sex === null) return false;
    if (meta.patient_sex !== "female") return true;
    return a[key] !== null;
  }
  const step = ALL_STEPS.find((st) => st.key === key);
  if (!step) return false;
  return validateStep(step, a, meta, explicitNone).complete;
}

export function validate(
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true> = {},
): ValidationResult {
  const parsed = AnswersSchema.safeParse(answers);
  const issues = parsed.success
    ? []
    : parsed.error.issues.map((i) => (i.path.join(".") || "(root)") + ": " + i.message);

  // The gating rule is re-checked here so a bad extraction patch cannot bypass the UI.
  if (meta.patient_sex !== "female") {
    if (answers.menstrual_cycle !== null)
      issues.push("menstrual_cycle: must be null unless patient_sex is female");
    if (answers.pregnancy_related !== null)
      issues.push("pregnancy_related: must be null unless patient_sex is female");
  }
  if (answers.past_treatment_side_effects === true && !answers.past_treatment_describe)
    issues.push("past_treatment_describe: required when past_treatment_side_effects is true");
  if (answers.past_treatment_side_effects !== true && answers.past_treatment_describe !== null)
    issues.push("past_treatment_describe: must be null unless past_treatment_side_effects is true");

  const missing = QUESTIONS.map((q) => q.key).filter(
    (k) => !isResolved(k, answers, meta, explicitNone),
  );

  return { valid: issues.length === 0 && missing.length === 0, missing, issues };
}

/** The object handed to the doctor: the 16 answers plus why the gated ones are null. */
export function buildOutput(answers: Answers, meta: Meta) {
  return {
    form: "GenoRoot Hair & Scalp Intake",
    completed_at: new Date().toISOString(),
    /**
     * Metadata, not graded answers - but clinically worth having: sex explains why the
     * two gated questions are null, and current age is what makes "hair loss began at 24"
     * interpretable. `first_name` is deliberately NOT here: a warmer form on the phone is
     * not a reason to put a patient's name in a downloaded clinical file.
     */
    patient_sex: meta.patient_sex,
    patient_age: meta.patient_age,
    answers,
  };
}
