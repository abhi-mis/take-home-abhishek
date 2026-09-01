/**
 * Extraction: system prompt + one schema SLICE per voice-enabled question.
 *
 * The model never sees the whole 16-question form. For each voice step we hand it
 * exactly one slice of the schema and one reply, which keeps the output space small
 * enough to be reliable at temperature 0 - and small enough to review by eye.
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
  PRODUCT_DUR,
  PRODUCT_ROWS,
  PROCEDURE_ROWS,
  SESSIONS,
  SMOKING_SEV,
  WASH,
  type Answers,
  type ProcedureRow,
  type ProductRow,
} from "./types";

/**
 * The four questions that offer a microphone: the tables, where a grid is genuinely
 * tedious - five rows with detail columns each.
 *
 * This list is also the API route's allow-list, which is why `consent` is not on it and
 * must never be added. Consent is the one answer that may never be inferred from prose;
 * it is collected by an explicit tap.
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

export interface ExtractResult {
  patch: Partial<Answers>;
  /** Dotted field paths the patient did not mention - the UI asks for these. */
  unfilled: string[];
}

export interface Slice {
  key: VoiceKey;
  /** Human label used in the prompt so the model knows what it is extracting. */
  label: string;
  jsonSchema: unknown;
  /** Parse + convert. Throws only if the payload is not an object at all. */
  run: (raw: unknown) => ExtractResult;
}

const asTuple = <T extends readonly string[]>(a: T) => a as unknown as [string, ...string[]];
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

export const SLICES: Record<VoiceKey, Slice> = {
  habits: habitsSlice,
  products: productsSlice,
  procedures: proceduresSlice,
  past_treatment_side_effects: sideEffectsSlice,
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
- When an option encodes a NUMERIC RANGE (for example "<5/day", "5-10/day", ">10/day",
  "<3mo", "3-6mo", ">6mo"), pick the range that actually CONTAINS the number the patient
  said. Two rules, because both boundaries get read wrongly:
    * never round down to a smaller range: 6 a day is "5-10/day", not "<5/day";
    * a number that IS a range's bound belongs to that range, and "greater than" means
      strictly greater: 10 a day is "5-10/day", not ">10/day"; 6 months is "3-6mo".
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
 * The prefilled opening brace means the output is already bare JSON - but a gateway in
 * between, or a model update, could still wrap it. Stripping fences and taking the
 * outermost object costs nothing, and a parser you only trust on the happy path is not a
 * parser. Returns null rather than throwing.
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
