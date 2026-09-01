/**
 * Answers + enums. Every enum is pulled OUT of lib/schema.ts rather than retyped,
 * so a schema edit is a compile error here instead of a silent drift.
 */
import { INTAKE_SCHEMA } from "./schema";

const S = INTAKE_SCHEMA.sections;

export const DURATION = S[0].questions[1].options;
export const FAMILY = S[0].questions[2].options;
export const PATTERN = S[0].questions[3].options;
export const CONDITIONS = S[1].questions[0].options;
export const MENSTRUAL = S[1].questions[1].options;
export const PREGNANCY = S[1].questions[2].options;
export const PAST6M = S[2].questions[0].options;
export const SMOKING_SEV = S[2].questions[1].rows[0].followup.options;
export const WASH = S[2].questions[1].rows[3].options;
export const PRODUCT_ROWS = S[3].questions[0].rows;
export const PRODUCT_DUR = S[3].questions[0].columns[1].options;
export const PROCEDURE_ROWS = S[3].questions[1].rows;
export const SESSIONS = S[3].questions[1].columns[1].options;
export const SAMPLE = S[4].questions[0].options;

/** "No known family history" and "None" clear every other choice when tapped. */
export const EXCLUSIVE_OPTIONS: Record<string, string> = {
  family_history: "No known family history",
  diagnosed_conditions: "None",
};

/**
 * Multi-selects whose schema offers NO "none" option, yet where an empty answer is
 * legitimate (Q4 pattern, Q10 recent events).
 *
 * Because validation now requires a real answer on every step, empty-and-unanswered
 * must be distinguishable from empty-on-purpose. These two keys get a UI-only
 * "None of these" control whose selection is recorded in the store's `explicitNone`
 * set - never in `Answers`, so the graded output stays exactly on-schema.
 */
export const NONE_ESCAPE_KEYS = ["pattern", "past_6_months"] as const;
export type NoneEscapeKey = (typeof NONE_ESCAPE_KEYS)[number];

export function hasNoneEscape(key: string): key is NoneEscapeKey {
  return (NONE_ESCAPE_KEYS as readonly string[]).includes(key);
}

export type Duration = (typeof DURATION)[number];
export type Menstrual = (typeof MENSTRUAL)[number];
export type Pregnancy = (typeof PREGNANCY)[number];
export type SmokingSeverity = (typeof SMOKING_SEV)[number];
export type WashFrequency = (typeof WASH)[number];
export type ProductRow = (typeof PRODUCT_ROWS)[number];
export type ProductDuration = (typeof PRODUCT_DUR)[number];
export type ProcedureRow = (typeof PROCEDURE_ROWS)[number];
export type Sessions = (typeof SESSIONS)[number];
export type SampleType = (typeof SAMPLE)[number];

/**
 * Every yes/no field is `boolean | null` while the form is being filled.
 *
 * This matters more than it looks. If `smoking` defaulted to `false`, an untouched row
 * would be indistinguishable from a patient who answered "No" - so the form could
 * never tell "not answered yet" from "answered No", and per-step validation would be a
 * lie. `null` means unanswered; validate.ts then REJECTS null, so a completed intake
 * always carries real booleans.
 */
export interface Habits {
  smoking: boolean | null;
  smoking_severity: SmokingSeverity | null; // required iff smoking === true
  alcohol: boolean | null;
  hard_water: boolean | null;
  hair_wash_frequency: WashFrequency | null;
  heating_tools_styling_chemicals: boolean | null;
  salon_treatments: boolean | null;
  salon_treatment_detail: string | null; // required iff salon_treatments === true
}

/** The yes/no rows of Q11, in schema order - used to validate that none is skipped. */
export const HABIT_YESNO_KEYS = [
  "smoking",
  "alcohol",
  "hard_water",
  "heating_tools_styling_chemicals",
  "salon_treatments",
] as const;

export interface ProductEntry {
  used: boolean | null; // null = row not answered yet
  duration: ProductDuration | null; // required iff used
  helped: boolean | null; // required iff used
  side_effects: boolean | null; // required iff used
}

export interface ProcedureEntry {
  done: boolean | null; // null = row not answered yet
  sessions: Sessions | null; // required iff done
  helped: boolean | null; // required iff done
}

export interface Answers {
  age_hair_loss_began: number | null;
  duration: Duration | null;
  family_history: string[];
  pattern: string[];
  diagnosed_conditions: string[];
  menstrual_cycle: Menstrual | null; // null unless female - valid, not missing
  pregnancy_related: Pregnancy | null; // null unless female - valid, not missing
  adult_acne_oily_skin: boolean | null;
  excess_body_facial_hair: boolean | null;
  past_6_months: string[];
  habits: Habits;
  products: Record<ProductRow, ProductEntry>;
  procedures: Record<ProcedureRow, ProcedureEntry>;
  past_treatment_side_effects: boolean | null;
  past_treatment_describe: string | null; // required iff above === true
  sample_type: SampleType | null;
  consent: boolean | null;
}

export type PatientSex = "male" | "female" | "prefer_not";

/**
 * Who the form is talking to.
 *
 * None of this is one of the 16 graded answers - it is asked first so the rest of the
 * form can adapt to the person filling it:
 *
 *   patient_sex  gates Q6/Q7, and is emitted so a doctor can see WHY they are null
 *   patient_age  drives the comfort scale (a 60-year-old should not have to pinch-zoom),
 *                caps the onset age at Q1, and turns the Q6/Q7 suggestions from a guess
 *                based on onset age into something based on the patient's actual age
 *   first_name   used only in on-screen copy, and deliberately NOT emitted - a warmer
 *                form is not worth putting a name in a downloaded clinical file
 */
export interface Meta {
  patient_sex: PatientSex | null;
  patient_age: number | null;
  first_name: string | null;
}

export const EMPTY_HABITS: Habits = {
  smoking: null,
  smoking_severity: null,
  alcohol: null,
  hard_water: null,
  hair_wash_frequency: null,
  heating_tools_styling_chemicals: null,
  salon_treatments: null,
  salon_treatment_detail: null,
};

export const EMPTY_PRODUCT: ProductEntry = {
  used: null,
  duration: null,
  helped: null,
  side_effects: null,
};

export const EMPTY_PROCEDURE: ProcedureEntry = { done: null, sessions: null, helped: null };

function emptyRecord<K extends string, V>(keys: readonly K[], value: V): Record<K, V> {
  return Object.fromEntries(keys.map((k) => [k, { ...value }])) as Record<K, V>;
}

export const EMPTY_ANSWERS: Answers = {
  age_hair_loss_began: null,
  duration: null,
  family_history: [],
  pattern: [],
  diagnosed_conditions: [],
  menstrual_cycle: null,
  pregnancy_related: null,
  adult_acne_oily_skin: null,
  excess_body_facial_hair: null,
  past_6_months: [],
  habits: { ...EMPTY_HABITS },
  products: emptyRecord(PRODUCT_ROWS, EMPTY_PRODUCT),
  procedures: emptyRecord(PROCEDURE_ROWS, EMPTY_PROCEDURE),
  past_treatment_side_effects: null,
  past_treatment_describe: null,
  sample_type: null,
  consent: null,
};

export const EMPTY_META: Meta = { patient_sex: null, patient_age: null, first_name: null };
