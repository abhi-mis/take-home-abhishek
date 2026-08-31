/**
 * Extraction: system prompt + one schema SLICE per voice-enabled question.
 *
 * The model never sees the whole 16-question form. For each voice step we hand it
 * exactly one slice of the schema and one transcript, which keeps the output space
 * small enough that a 70B open model at temperature 0 is reliable.
 *
 * Each slice owns three things:
 *   jsonSchema - the shape shown to the model, built from lib/schema.ts option strings
 *   run() - Zod-parses the model's JSON and converts it to a store patch
 *   unfilled - fields the transcript did not mention, so the UI can ask for a tap
 *
 * Anything off-schema is dropped rather than repaired: a wrong option string in a
 * medical intake is worse than a blank the patient taps in.
 */
import { z } from "zod";
import {
  CONDITIONS,
  DURATION,
  EXCLUSIVE_OPTIONS,
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
  hasNoneEscape,
  type Answers,
  type ProcedureRow,
  type ProductRow,
} from "./types";

/**
 * The four questions the FORM offers a microphone on - the tables, where a grid is
 * genuinely tedious. This list drives the speak-first screens and is deliberately
 * unchanged by chat mode.
 */
export const VOICE_KEYS = [
  "habits",
  "products",
  "procedures",
  "past_treatment_side_effects",
] as const;
export type VoiceKey = (typeof VOICE_KEYS)[number];

export function isVoiceKey(k: string): k is VoiceKey {
  return (VOICE_KEYS as readonly string[]).includes(k);
}

/**
 * The remaining questions, extractable because CHAT mode has no grid to fall back on:
 * a patient who types "my mum and my sister both lost hair" has to be understood.
 *
 * `consent` is absent on purpose and must stay absent. Consent is the one answer that
 * may never be inferred from prose - it is collected by an explicit tap in both modes.
 * The sex gate is absent too: it is matched locally (lib/chatFlow.ts) with no model
 * call, because three fixed choices do not need one.
 */
export const CHAT_ONLY_KEYS = [
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
  "sample_type",
] as const;

export const EXTRACT_KEYS = [...VOICE_KEYS, ...CHAT_ONLY_KEYS] as const;
export type ExtractKey = (typeof EXTRACT_KEYS)[number];

/** The API route's allow-list. Anything not on it cannot reach the model. */
export function isExtractKey(k: string): k is ExtractKey {
  return (EXTRACT_KEYS as readonly string[]).includes(k);
}

export interface ExtractResult {
  patch: Partial<Answers>;
  /** Dotted field paths the patient did not mention - the UI asks for these. */
  unfilled: string[];
  /**
   * Multi-selects the patient actively denied ("none of these") on the two questions
   * whose schema offers no such option. Recorded as a deliberate empty answer rather
   * than left looking unanswered - see `explicitNone` in lib/store.ts.
   */
  none?: string[];
}

export interface Slice {
  key: ExtractKey;
  /** Human label used in the prompt so the model knows what it is extracting. */
  label: string;
  jsonSchema: unknown;
  /** Parse + convert. Throws only if the payload is not an object at all. */
  run: (raw: unknown) => ExtractResult;
}

const asTuple = <T extends readonly string[]>(a: T) => a as unknown as [string, ...string[]];
/**
 * Anything that is not a plain object becomes one.
 *
 * A model that answers `"Irregular"` instead of `{"value":"Irregular"}` is wrong, but it
 * must not be able to throw its way out of a slice: the caller would lose the difference
 * between "the model said nothing usable" (ask the patient again) and "the code broke".
 * The table slices already had this via `z.record(...).catch({})`.
 */
const asObject = (raw: unknown): Record<string, unknown> =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
/** Every model-facing field is nullable: "not mentioned" must be expressible. */
const optN = <T extends readonly string[]>(a: T) => z.enum(asTuple(a)).nullable().catch(null);
const boolN = () => z.boolean().nullable().catch(null);
const strN = () =>
  z
    .string()
    .trim()
    .min(1)
    .nullable()
    .catch(null);

// ---------------------------------------------------------------------------
// Q11 habits
// ---------------------------------------------------------------------------
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
  label: "Lifestyle habits",
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
    const v = HabitsRaw.partial().parse(raw ?? {});
    const patch: Partial<Answers> = {};
    const unfilled: string[] = [];
    const habits: Record<string, unknown> = {};

    for (const [field, value] of Object.entries(v)) {
      if (value === null || value === undefined) unfilled.push("habits." + field);
      else habits[field] = value;
    }
    // Conditional invariants: never ship a followup whose trigger is false/unknown.
    if (habits.smoking !== true) delete habits.smoking_severity;
    if (habits.salon_treatments !== true) delete habits.salon_treatment_detail;
    if (habits.smoking === true && habits.smoking_severity === undefined)
      pushOnce(unfilled, "habits.smoking_severity");
    if (habits.salon_treatments === true && habits.salon_treatment_detail === undefined)
      pushOnce(unfilled, "habits.salon_treatment_detail");

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
function pushOnce(arr: string[], v: string) {
  if (!arr.includes(v)) arr.push(v);
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
  label: "Products currently or recently used",
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
  label: "Clinic procedures already done",
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
  label: "Side effects from past hair treatments",
  jsonSchema: {
    past_treatment_side_effects: "boolean | null",
    past_treatment_describe: "string | null (verbatim summary, only if true)",
  },
  run: (raw) => {
    const v = SideEffectsRaw.partial().parse(raw ?? {});
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

// ---------------------------------------------------------------------------
// The single-answer questions (chat mode only)
//
// Three tiny factories rather than eleven hand-written slices, so the option strings
// come from the schema constants and a question cannot drift from what it validates
// against. Each one keeps the same contract as the tables: unmentioned -> `unfilled`,
// off-schema -> dropped, never coerced.
// ---------------------------------------------------------------------------

/** One choice from a fixed list: Q2, Q6, Q7, Q15. */
function singleSlice<K extends ExtractKey>(
  key: K,
  label: string,
  options: readonly string[],
  note?: string,
): Slice {
  const Raw = z.object({ value: optN(options) });
  return {
    key,
    label: note ? `${label} ${note}` : label,
    jsonSchema: { value: [...options, null] },
    run: (raw) => {
      const v = Raw.partial().parse(asObject(raw));
      if (v.value === null || v.value === undefined) return { patch: {}, unfilled: [key] };
      return { patch: { [key]: v.value } as unknown as Partial<Answers>, unfilled: [] };
    },
  };
}

/** Yes or no: Q8, Q9. */
function yesNoSlice<K extends ExtractKey>(key: K, label: string): Slice {
  const Raw = z.object({ value: boolN() });
  return {
    key,
    label,
    jsonSchema: { value: "boolean | null" },
    run: (raw) => {
      const v = Raw.partial().parse(asObject(raw));
      if (v.value === null || v.value === undefined) return { patch: {}, unfilled: [key] };
      return { patch: { [key]: v.value } as unknown as Partial<Answers>, unfilled: [] };
    },
  };
}

/**
 * Any number of choices: Q3, Q4, Q5, Q10.
 *
 * Denial is the interesting case, and it has two different shapes in this schema.
 * Q3 and Q5 carry an explicit exclusive option ("No known family history", "None"), so
 * "nothing like that" resolves to selecting that option. Q4 and Q10 have no such
 * option, so denial is recorded as `none` - a deliberate empty answer - which is the
 * only way the form can tell "nothing applies" from "not asked yet".
 */
function multiSlice<K extends ExtractKey>(
  key: K,
  label: string,
  options: readonly string[],
): Slice {
  const exclusive = EXCLUSIVE_OPTIONS[key];
  const Raw = z.object({
    selected: z.array(z.string()).nullable().catch(null),
    none_of_these: boolN(),
  });
  return {
    key,
    label,
    jsonSchema: {
      selected: `array of these exact strings, or [] : ${JSON.stringify(options)}`,
      none_of_these: "boolean | null (true only if the patient denies all of them)",
    },
    run: (raw) => {
      const v = Raw.partial().parse(asObject(raw));
      // Unknown strings are dropped, not repaired: a near-miss option in a medical
      // intake is worse than an unanswered question the patient is asked again.
      let picked = (v.selected ?? []).filter((s) => options.includes(s));

      if (exclusive !== undefined) {
        if (v.none_of_these === true) picked = [exclusive];
        // "None" plus a real condition is contradictory; the explicit denial loses.
        else if (picked.includes(exclusive) && picked.length > 1)
          picked = picked.filter((p) => p !== exclusive);
      }

      if (picked.length > 0)
        return { patch: { [key]: picked } as unknown as Partial<Answers>, unfilled: [] };

      if (v.none_of_these === true && hasNoneEscape(key))
        return { patch: { [key]: [] } as unknown as Partial<Answers>, unfilled: [], none: [key] };

      return { patch: {}, unfilled: [key] };
    },
  };
}

/**
 * Q1 age. Out-of-range numbers are dropped rather than clamped: "I was 3" is far more
 * likely a transcription error than a fact, and a silently clamped age is a wrong
 * answer nobody will notice.
 */
const AGE_MIN = 5;
const AGE_MAX = 90;
const ageSlice: Slice = {
  key: "age_hair_loss_began",
  label: "Age when hair loss began",
  jsonSchema: {
    age: `integer ${AGE_MIN}-${AGE_MAX} | null (the age hair loss STARTED, not the patient's current age)`,
  },
  run: (raw) => {
    const v = z
      .object({ age: z.number().int().min(AGE_MIN).max(AGE_MAX).nullable().catch(null) })
      .partial()
      .parse(asObject(raw));
    if (v.age === null || v.age === undefined)
      return { patch: {}, unfilled: ["age_hair_loss_began"] };
    return { patch: { age_hair_loss_began: v.age }, unfilled: [] };
  },
};

export const SLICES: Record<ExtractKey, Slice> = {
  habits: habitsSlice,
  products: productsSlice,
  procedures: proceduresSlice,
  past_treatment_side_effects: sideEffectsSlice,

  age_hair_loss_began: ageSlice,
  duration: singleSlice(
    "duration",
    "How long the hair loss has been going on",
    DURATION,
    "(duration of the hair loss)",
  ),
  family_history: multiSlice("family_history", "Family history of hair loss", FAMILY),
  pattern: multiSlice("pattern", "Where the hair loss is happening", PATTERN),
  diagnosed_conditions: multiSlice(
    "diagnosed_conditions",
    "Conditions diagnosed by a doctor",
    CONDITIONS,
  ),
  menstrual_cycle: singleSlice("menstrual_cycle", "Menstrual cycle", MENSTRUAL),
  pregnancy_related: singleSlice("pregnancy_related", "Pregnancy status", PREGNANCY),
  adult_acne_oily_skin: yesNoSlice("adult_acne_oily_skin", "Adult acne or oily skin"),
  excess_body_facial_hair: yesNoSlice(
    "excess_body_facial_hair",
    "Excess body or facial hair",
  ),
  past_6_months: multiSlice("past_6_months", "Events in the last 6 months", PAST6M),
  sample_type: singleSlice("sample_type", "Preferred sample type", SAMPLE),
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
      that") -> set every item's used/done to false.
  (b) Otherwise -> include ONLY the items the patient actually named, and omit the
      rest entirely. Trailing phrases like "nothing else" do not name an item.
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
 * The Anthropic path prefills the assistant turn with an opening brace, so its output is
 * already bare JSON - but NIM's open models are not guaranteed to be, and neither is a
 * proxy in between. Stripping fences and taking the outermost object costs nothing and
 * keeps one parser for both providers. Returns null rather than throwing.
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
export function extractFromModelText(key: ExtractKey, text: string): ExtractResult | null {
  const json = parseModelJson(text);
  if (json === null) return null;
  try {
    return SLICES[key].run(json);
  } catch {
    return null;
  }
}
