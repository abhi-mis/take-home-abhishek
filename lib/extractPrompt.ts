/**
 * Extraction: system prompt + one schema SLICE per question.
 *
 * The model never sees the whole form. For each question we hand it exactly one slice of
 * the schema and one reply, which keeps the output space small enough to be reliable at
 * temperature 0 - and small enough to review by eye.
 *
 * Each slice owns three things:
 *   jsonSchema - the shape shown to the model, built from lib/schema.ts option strings
 *   run() - Zod-parses the model's JSON and converts it to a store patch
 *   unfilled - fields the transcript did not mention, so the UI can ask for a tap
 *
 * Anything off-schema is dropped rather than repaired: a wrong option string in a medical
 * intake is worse than a blank the patient taps in. The one thing that IS repaired is
 * capitalisation and whitespace, because "topical minoxidil" and "Topical Minoxidil" are
 * the same answer - see `pickOption`, which can only ever return a string the schema
 * already contains.
 */
import { z } from "zod";
import { COPY } from "./copy";
import { getQuestion, type QuestionKey } from "./schema";
import {
  EXCLUSIVE_OPTIONS,
  PRODUCT_DUR,
  PRODUCT_ROWS,
  PROCEDURE_ROWS,
  SESSIONS,
  SMOKING_SEV,
  WASH,
  type Answers,
  type Meta,
  type ProcedureRow,
  type ProductRow,
} from "./types";
import { AGE_MAX, AGE_MIN, ONSET_MIN } from "./patient";

/**
 * Every question offers a microphone - and exactly one does not.
 *
 * `consent` is absent and must never be added. It is the one answer that may not be
 * inferred from prose: a patient agreeing to a genetic test has to say so by pressing the
 * word "Yes", not by saying something a transcriber and then a model both had to guess at.
 * This list is also the API route's allow-list, so its absence here is what makes that
 * unreachable rather than merely unused.
 *
 * "about" is not a graded question - it is the name, sex and age asked on the first card -
 * and it is here because a form you can only start by typing is not a form you can answer
 * by speaking.
 */
export const VOICE_KEYS = [
  "about",
  "age_hair_loss_began",
  "duration",
  "family_history",
  "pattern",
  "diagnosed_conditions",
  "menstrual_cycle",
  "pregnancy_related",
  "adult_acne_oily_skin",
  "excess_body_facial_hair",
  "past_6_months",
  "habits",
  "products",
  "procedures",
  "past_treatment_side_effects",
  "sample_type",
] as const;
export type VoiceKey = (typeof VOICE_KEYS)[number];

export function isVoiceKey(k: string): k is VoiceKey {
  return (VOICE_KEYS as readonly string[]).includes(k);
}

export interface ExtractResult {
  patch: Partial<Answers>;
  /**
   * The About You card writes name, sex and age, which are `Meta` and not answers.
   *
   * A separate field rather than a widened `patch`, because `Answers` is the object that
   * becomes the download and nothing that is not one of the 16 answers may ever be able
   * to reach it, even by accident.
   */
  meta?: Partial<Meta>;
  /**
   * Multi-selects the patient actively denied, where the schema offers no "None" option
   * (Q4, Q10). The client records these in `explicitNone`, never in `Answers`.
   */
  noneOf?: string[];
  /** Field paths the patient did not mention - the UI asks for these. */
  unfilled: string[];
}

export interface Slice {
  key: VoiceKey;
  /** The question as the patient was asked it, so the model knows what it is extracting. */
  label: string;
  jsonSchema: unknown;
  /** Parse + convert. Throws only if the payload is not an object at all. */
  run: (raw: unknown) => ExtractResult;
}

// ---------------------------------------------------------------------------
// Value readers
// ---------------------------------------------------------------------------

const collapse = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * A model value mapped onto one of the schema's own option strings, or null.
 *
 * Matching ignores case and runs of whitespace and NOTHING else. No prefix matching, no
 * fuzzy distance, no "closest" option: "Not applicable" and "Currently pregnant" are two
 * clinical facts and a matcher confident enough to bridge them is a matcher that will
 * eventually bridge the wrong pair. Either the model said an option or it did not.
 */
export function pickOption(raw: unknown, options: readonly string[]): string | null {
  if (typeof raw !== "string") return null;
  const want = collapse(raw);
  if (want === "") return null;
  return options.find((o) => collapse(o) === want) ?? null;
}

/** Every model-facing field is nullable: "not mentioned" must be expressible. */
const optN = (options: readonly string[]) =>
  z
    .unknown()
    .transform((v) => pickOption(v, options))
    .catch(null);

const boolN = () => z.boolean().nullable().catch(null);

const strN = () => z.string().trim().min(1).nullable().catch(null);

/** A whole number inside a range, from either a number or a numeral in a string. */
const intN = (min: number, max: number) =>
  z
    .unknown()
    .transform((v) => {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    })
    .catch(null);

/** Model strings mapped onto schema options, de-duplicated, invented values dropped. */
function pickOptions(raw: unknown, options: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const hit = pickOption(item, options);
    if (hit !== null && !out.includes(hit)) out.push(hit);
  }
  return out;
}

const questionLabel = (key: QuestionKey) => COPY[key].title;

/**
 * The option strings for a question, read off the schema itself.
 *
 * Read here rather than passed in, because the alternative was passing the aliases in
 * lib/types (`DURATION`, `MENSTRUAL`, ...) which reach the schema BY POSITION -
 * `S[0].questions[1].options`. Handing those to the wrong slice is a mistake nothing
 * would catch: the model would be shown one question's options under another question's
 * name, answer it perfectly, and every value would be dropped as off-schema. Keyed
 * lookup makes the mistake unavailable.
 */
function schemaOptions(key: QuestionKey): readonly string[] {
  const q = getQuestion(key);
  return "options" in q ? q.options : [];
}

// ---------------------------------------------------------------------------
// Q1 the onset age
// ---------------------------------------------------------------------------

/**
 * The upper bound here is the SCHEMA's, not this patient's.
 *
 * A route has no session, so it cannot know that the patient said they are 34 on the card
 * before. The real ceiling - you cannot have started losing hair after your current age -
 * is applied on the client, where the age is known, by `voiceApply`.
 */
const onsetSlice: Slice = {
  key: "age_hair_loss_began",
  label: questionLabel("age_hair_loss_began"),
  jsonSchema: {
    age_hair_loss_began: `integer ${ONSET_MIN}-${AGE_MAX} | null (age when the hair loss STARTED, not the patient's age now)`,
  },
  run: (raw) => {
    const v = z
      .object({ age_hair_loss_began: intN(ONSET_MIN, AGE_MAX) })
      .partial()
      .catch({})
      .parse(raw ?? {});
    const age = v.age_hair_loss_began ?? null;
    return age === null
      ? { patch: {}, unfilled: ["age_hair_loss_began"] }
      : { patch: { age_hair_loss_began: age }, unfilled: [] };
  },
};

// ---------------------------------------------------------------------------
// About you - name, sex, age. Meta, not answers.
// ---------------------------------------------------------------------------

const SEX_TOKENS = ["female", "male", "prefer_not"] as const;

const aboutSlice: Slice = {
  key: "about",
  label: "The patient's own name, sex and age",
  jsonSchema: {
    first_name: "string | null (given name only, as the patient said it)",
    patient_sex: [...SEX_TOKENS, null],
    patient_age: `integer ${AGE_MIN}-${AGE_MAX} | null (how old the patient is NOW)`,
  },
  run: (raw) => {
    const v = z
      .object({
        first_name: strN(),
        patient_sex: optN(SEX_TOKENS),
        patient_age: intN(AGE_MIN, AGE_MAX),
      })
      .partial()
      .catch({})
      .parse(raw ?? {});

    const meta: Partial<Meta> = {};
    const unfilled: string[] = [];

    // A name is optional on the card, so a reply without one is complete, not short.
    if (v.first_name) meta.first_name = v.first_name;
    if (v.patient_sex) meta.patient_sex = v.patient_sex as Meta["patient_sex"];
    else unfilled.push("patient_sex");
    if (v.patient_age !== null && v.patient_age !== undefined) meta.patient_age = v.patient_age;
    else unfilled.push("patient_age");

    return { patch: {}, meta, unfilled };
  },
};

// ---------------------------------------------------------------------------
// Single choice - Q2, Q6, Q7, Q15
// ---------------------------------------------------------------------------

function singleSlice(key: QuestionKey): Slice {
  const options = schemaOptions(key);
  return {
    key: key as VoiceKey,
    label: questionLabel(key),
    jsonSchema: { [key]: [...options, null] },
    run: (raw) => {
      const v = z
        .object({ [key]: optN(options) })
        .partial()
        .catch({})
        .parse(raw ?? {});
      const chosen = v[key] ?? null;
      return chosen === null
        ? { patch: {}, unfilled: [key] }
        : { patch: { [key]: chosen } as unknown as Partial<Answers>, unfilled: [] };
    },
  };
}

// ---------------------------------------------------------------------------
// Yes / no - Q8, Q9
// ---------------------------------------------------------------------------

function yesNoSlice(key: QuestionKey): Slice {
  return {
    key: key as VoiceKey,
    label: questionLabel(key),
    jsonSchema: { [key]: "boolean | null" },
    run: (raw) => {
      const v = z
        .object({ [key]: boolN() })
        .partial()
        .catch({})
        .parse(raw ?? {});
      const said = v[key] ?? null;
      return said === null
        ? { patch: {}, unfilled: [key] }
        : { patch: { [key]: said } as unknown as Partial<Answers>, unfilled: [] };
    },
  };
}

// ---------------------------------------------------------------------------
// Multi select - Q3, Q4, Q5, Q10
// ---------------------------------------------------------------------------

/**
 * Two fields, because "nothing applies to me" is an answer and an empty list is not.
 *
 * `selected: []` with `none_apply: null` means the reply said nothing about this question,
 * and the card stays unanswered. `none_apply: true` means the patient denied all of it,
 * which lands either on the schema's own denial option ("None", "No known family history")
 * or, on the two questions that have none, in the UI-only `explicitNone` set. Collapsing
 * those two states into one empty array is how a form ends up recording "no conditions"
 * for a patient who was never asked.
 */
function multiSlice(key: QuestionKey): Slice {
  const options = schemaOptions(key);
  const denial = EXCLUSIVE_OPTIONS[key];
  return {
    key: key as VoiceKey,
    label: questionLabel(key),
    jsonSchema: {
      selected: `array of these exact strings, or empty: ${JSON.stringify(options)}`,
      none_apply: "boolean | null (true ONLY if the patient denied every one of them)",
    },
    run: (raw) => {
      const v = z
        .object({
          selected: z.unknown().transform((s) => pickOptions(s, options)),
          none_apply: boolN(),
        })
        .partial()
        .catch({})
        .parse(raw ?? {});

      let selected = v.selected ?? [];
      // The exclusive option cannot coexist with a real one; the same rule as a tap.
      if (denial !== undefined && selected.includes(denial)) selected = [denial];

      if (selected.length > 0) {
        return { patch: { [key]: selected } as unknown as Partial<Answers>, unfilled: [] };
      }
      if (v.none_apply === true) {
        return denial === undefined
          ? { patch: { [key]: [] } as unknown as Partial<Answers>, noneOf: [key], unfilled: [] }
          : { patch: { [key]: [denial] } as unknown as Partial<Answers>, unfilled: [] };
      }
      return { patch: {}, unfilled: [key] };
    },
  };
}

// ---------------------------------------------------------------------------
// Q11 habits
// ---------------------------------------------------------------------------

const HABITS_FIELDS = [
  "smoking",
  "smoking_severity",
  "alcohol",
  "hard_water",
  "hair_wash_frequency",
  "heating_tools_styling_chemicals",
  "salon_treatments",
  "salon_treatment_detail",
] as const;

const HabitsRaw = z.object({
  smoking: boolN(),
  smoking_severity: optN(SMOKING_SEV),
  alcohol: boolN(),
  hard_water: boolN(),
  hair_wash_frequency: optN(WASH),
  heating_tools_styling_chemicals: boolN(),
  salon_treatments: boolN(),
  salon_treatment_detail: strN(),
});

const habitsSlice: Slice = {
  key: "habits",
  label: questionLabel("habits"),
  jsonSchema: {
    smoking: "boolean | null",
    smoking_severity: [...SMOKING_SEV, null],
    alcohol: "boolean | null",
    hard_water: "boolean | null (hard water at home)",
    hair_wash_frequency: [...WASH, null],
    heating_tools_styling_chemicals: "boolean | null (dryer, straightener, colouring)",
    salon_treatments: "boolean | null (keratin, smoothening, colouring at a salon)",
    salon_treatment_detail: "string | null (only if salon_treatments is true)",
  },
  run: (raw) => {
    const v = HabitsRaw.partial().catch({}).parse(raw ?? {});
    const patch: Partial<Answers> = {};
    const unfilled: string[] = [];
    const habits: Record<string, unknown> = {};

    /*
      Walked over the slice's OWN field list rather than over the keys the model happened
      to return. A model that omits `alcohol` entirely and a model that returns
      `alcohol: null` are saying the same thing - nothing was said about alcohol - and only
      the second one appears in `Object.entries`. Counting from the model's output made
      "filled 6 of 6" true of a reply that answered two rows.
    */
    for (const field of HABITS_FIELDS) {
      const value = v[field];
      if (value === null || value === undefined) unfilled.push("habits." + field);
      else habits[field] = value;
    }
    // Conditional invariants: never ship a followup whose trigger is false/unknown.
    if (habits.smoking !== true) delete habits.smoking_severity;
    if (habits.salon_treatments !== true) delete habits.salon_treatment_detail;

    if (Object.keys(habits).length > 0) {
      patch.habits = habits as unknown as Answers["habits"];
    }
    return { patch, unfilled: unfilled.filter((f) => keep(f, habits)) };
  },
};

/** Drop unfilled entries for followups that are moot because the trigger is false. */
function keep(path: string, habits: Record<string, unknown>): boolean {
  if (path === "habits.smoking_severity") return habits.smoking === true;
  if (path === "habits.salon_treatment_detail") return habits.salon_treatments === true;
  return true;
}

// ---------------------------------------------------------------------------
// Q12 products / Q13 procedures - same shape, different columns
// ---------------------------------------------------------------------------
const ProductRaw = z.object({
  used: boolN(),
  duration: optN(PRODUCT_DUR),
  helped: boolN(),
  side_effects: boolN(),
});
const ProcedureRaw = z.object({
  done: boolN(),
  sessions: optN(SESSIONS),
  helped: boolN(),
});

/**
 * Table slices share one converter. Two rules that matter clinically:
 *  - a row is only marked used/done when the patient actually said so; silence
 *    leaves the store default (false) and does NOT count as unfilled, because
 *    "I use minoxidil and biotin" implies nothing about a hair transplant;
 *  - detail columns are only requested for rows that ARE used/done.
 */
function tableSlice<Row extends string>(opts: {
  key: VoiceKey;
  label: string;
  rows: readonly Row[];
  flag: "used" | "done";
  detailCols: readonly string[];
  rowSchema: z.ZodType<Record<string, unknown>>;
  colSchema: Record<string, unknown>;
}): Slice {
  return {
    key: opts.key,
    label: opts.label,
    jsonSchema: Object.fromEntries(opts.rows.map((r) => [r, opts.colSchema])),
    run: (raw) => {
      const obj = z.record(z.string(), z.unknown()).catch({}).parse(raw ?? {});
      const patch: Record<string, Record<string, unknown>> = {};
      const unfilled: string[] = [];

      for (const row of opts.rows) {
        const cell = obj[row];
        if (cell === undefined || cell === null) continue; // row not mentioned
        const parsed = opts.rowSchema.safeParse(cell);
        if (!parsed.success) continue;
        const flag = parsed.data[opts.flag];
        if (flag !== true && flag !== false) continue; // no clear statement about this row

        const entry: Record<string, unknown> = { [opts.flag]: flag };
        if (flag === true) {
          for (const col of opts.detailCols) {
            const val = parsed.data[col];
            if (val === null || val === undefined) unfilled.push(row + "." + col);
            else entry[col] = val;
          }
        }
        patch[row] = entry;
      }

      if (Object.keys(patch).length === 0) return { patch: {}, unfilled };
      return {
        patch: { [opts.key]: patch } as unknown as Partial<Answers>,
        unfilled,
      };
    },
  };
}

const productsSlice = tableSlice<ProductRow>({
  key: "products",
  label: questionLabel("products"),
  rows: PRODUCT_ROWS,
  flag: "used",
  detailCols: ["duration", "helped", "side_effects"],
  rowSchema: ProductRaw,
  colSchema: {
    used: "boolean | null",
    duration: [...PRODUCT_DUR, null],
    helped: "boolean | null",
    side_effects: "boolean | null",
  },
});

const proceduresSlice = tableSlice<ProcedureRow>({
  key: "procedures",
  label: questionLabel("procedures"),
  rows: PROCEDURE_ROWS,
  flag: "done",
  detailCols: ["sessions", "helped"],
  rowSchema: ProcedureRaw,
  colSchema: {
    done: "boolean | null",
    sessions: [...SESSIONS, null],
    helped: "boolean | null",
  },
});

// ---------------------------------------------------------------------------
// Q14 past treatment side effects + free-text describe
// ---------------------------------------------------------------------------
const SideEffectsRaw = z.object({
  past_treatment_side_effects: boolN(),
  past_treatment_describe: strN(),
});

const sideEffectsSlice: Slice = {
  key: "past_treatment_side_effects",
  label: questionLabel("past_treatment_side_effects"),
  jsonSchema: {
    past_treatment_side_effects: "boolean | null",
    past_treatment_describe: "string | null (verbatim summary, only if true)",
  },
  run: (raw) => {
    const v = SideEffectsRaw.partial().catch({}).parse(raw ?? {});
    const patch: Partial<Answers> = {};
    const unfilled: string[] = [];
    const had = v.past_treatment_side_effects ?? null;

    if (had === null) unfilled.push("past_treatment_side_effects");
    else patch.past_treatment_side_effects = had;

    if (had === true) {
      if (v.past_treatment_describe) patch.past_treatment_describe = v.past_treatment_describe;
      else unfilled.push("past_treatment_describe");
    } else if (had === false) {
      patch.past_treatment_describe = null; // enforce the conditional-null rule
    }
    return { patch, unfilled };
  },
};

export const SLICES: Record<VoiceKey, Slice> = {
  about: aboutSlice,
  age_hair_loss_began: onsetSlice,
  duration: singleSlice("duration"),
  family_history: multiSlice("family_history"),
  pattern: multiSlice("pattern"),
  diagnosed_conditions: multiSlice("diagnosed_conditions"),
  menstrual_cycle: singleSlice("menstrual_cycle"),
  pregnancy_related: singleSlice("pregnancy_related"),
  adult_acne_oily_skin: yesNoSlice("adult_acne_oily_skin"),
  excess_body_facial_hair: yesNoSlice("excess_body_facial_hair"),
  past_6_months: multiSlice("past_6_months"),
  habits: habitsSlice,
  products: productsSlice,
  procedures: proceduresSlice,
  past_treatment_side_effects: sideEffectsSlice,
  sample_type: singleSlice("sample_type"),
};

export const SYSTEM_PROMPT = `You extract structured intake answers from a patient's reply at a hair clinic in India.
The reply may be spoken (transcribed) or typed.
Input: (1) the JSON schema for ONE question, (2) the reply.
The reply may be English, Hindi, or Hinglish (mixed) and may be loosely transcribed.
Return ONLY a JSON object using the schema's keys and EXACT allowed option strings.
Rules:
- Use ONLY what the patient explicitly said. If a field was not mentioned, set it null.
  Set a used/done boolean to false only if the patient clearly said no to that item.
- For a list of items, exactly two cases:
  (a) The patient denies ALL of them ("nothing", "none of these", "I never did any of
      that") -> set every item's used/done to false, or set none_apply to true where the
      schema has that field.
  (b) Otherwise -> include ONLY the items the patient actually named, and omit the
      rest entirely. Trailing phrases like "nothing else" do not name an item.
- Where the schema has "selected" and "none_apply": put in "selected" only the options the
  patient actually named. Set none_apply true ONLY if they denied every option. If they
  said nothing about this question, leave selected empty and none_apply null.
- When an option encodes a NUMERIC RANGE (for example "<5/day", "5-10/day", ">10/day",
  "<3mo", "3-6mo", ">6mo"), pick the range that actually CONTAINS the number the patient
  said. Two rules, because both boundaries get read wrongly:
    * never round down to a smaller range: 6 a day is "5-10/day", not "<5/day";
    * a number that IS a range's bound belongs to that range, and "greater than" means
      strictly greater: 10 a day is "5-10/day", not ">10/day"; 6 months is "3-6mo".
- An age is the number of years the patient said. Never compute one from a year of birth,
  and never confuse the patient's age now with the age something started.
- Never invent options or values. When unsure, null.
- Map colloquial phrasing to the closest allowed option only when the meaning is
  unambiguous (e.g. "roz dhota hoon" -> "Daily"; "do din mein ek baar" -> "Alternate Days").
- Do not diagnose, infer, or fill anything the patient did not say.
- No prose, no markdown - JSON only.`;

export function buildUserMessage(slice: Slice, transcript: string): string {
  return [
    "Question: " + slice.label,
    "Schema: " + JSON.stringify(slice.jsonSchema, null, 2),
    'Transcript: "' + transcript.replace(/"/g, "'") + '"',
    "Return the JSON object now.",
  ].join("\n\n");
}

/**
 * Model text to JSON, tolerantly. A gateway in between, or a model update, can wrap the
 * output in a fence; stripping fences and taking the outermost object costs nothing, and a
 * parser you only trust on the happy path is not a parser. Returns null rather than
 * throwing.
 */
export function parseModelJson(text: string): unknown {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Full local pipeline: model text -> validated patch. Shared by the route and tests. */
export function extractFromModelText(key: VoiceKey, text: string): ExtractResult | null {
  const json = parseModelJson(text);
  if (json === null) return null;
  try {
    return SLICES[key].run(json);
  } catch {
    return null;
  }
}
