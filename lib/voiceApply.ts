/**
 * What a spoken reply is allowed to write, decided here and nowhere else.
 *
 * The server already validated the model's output against one schema slice. This is the
 * SECOND gate, and it is not paranoia about our own route - it exists because two rules
 * cannot be checked on the server at all:
 *
 *   1. the onset age has a ceiling that depends on the age this patient gave on the first
 *      card, and a stateless route does not know it;
 *   2. `PCOS/PCOD` is closed to a male patient, and closed options must not be reachable
 *      by voice when they are unpressable by thumb.
 *
 * While it is here, it also does the cheap structural check: only the fields the question
 * being answered OWNS, only the three fields of `Meta`, and only value shapes those fields
 * accept. The client is the last thing between a JSON body and a clinical record, so "it
 * came from our own API" is not the same as "it is safe to spread into the answers".
 *
 * Pure, so all of that is testable without a browser, a mic, or a key.
 */
import { EMPTY_ANSWERS, hasNoneEscape, type Answers, type Meta, type PatientSex } from "./types";
import { cleanFirstName, maxOnsetAge, unavailableOptions, AGE_MAX, AGE_MIN } from "./patient";
import { getQuestion, type QuestionKey } from "./schema";
import type { Step } from "./steps";
import type { Lang } from "./i18n";

/** The route's response body, as it arrives: trusted for shape by nothing yet. */
export interface VoicePayload {
  patch?: unknown;
  meta?: unknown;
  noneOf?: unknown;
  unfilled?: unknown;
}

export interface VoicePlan {
  /** Ready to hand to the store's `patch`. */
  answers: Partial<Answers>;
  /** Ready to hand to setSex / setAge / setFirstName. */
  meta: Partial<Meta>;
  /** Multi-selects to record as a deliberate "None of these". */
  noneOf: string[];
  /** How many separate facts this reply actually recorded. */
  filled: number;
  /** How many the reply left for the patient to tap. */
  missing: number;
  /**
   * Values the reply named that this patient may not give.
   *
   * Kept and reported rather than silently dropped: a male patient who says "PCOS" has
   * said something the form has a specific answer to, and swallowing it would look like
   * the microphone had not heard him.
   */
  blocked: string[];
}

const ANSWER_KEYS = new Set(Object.keys(EMPTY_ANSWERS));

/**
 * The answer fields a reply to ONE question is allowed to write.
 *
 * Not "any of the 16", which was the first version and was too loose to be worth much:
 * every one of the 16 is a legal answer key, `consent` included, so filtering on that set
 * would let a reply about hair-wash frequency carry a consent flag. A question owns the
 * field of the same name and, in exactly one case, one more - Q14 writes both the yes/no
 * and the description that belongs to it.
 *
 * `about` owns nothing here on purpose. Name, sex and age are `Meta`, and `Meta` is
 * handled separately precisely so it can never be confused with an answer.
 */
function fieldsOwnedBy(key: string): ReadonlySet<string> {
  if (key === "about") return new Set();
  if (key === "past_treatment_side_effects") {
    return new Set(["past_treatment_side_effects", "past_treatment_describe"]);
  }
  return ANSWER_KEYS.has(key) ? new Set([key]) : new Set();
}

/** Which slice answers this step, or null when the step has no voice path (consent). */
export function voiceKeyForStep(step: Step): string | null {
  if (step.kind === "about") return "about";
  if (step.kind === "consent") return null;
  return step.key;
}

/**
 * A leaf is one fact the patient stated. Nested objects (habits, the product and
 * procedure tables) are counted through, so "Filled 4 of 6" means four things they said
 * rather than four top-level keys that happened to change.
 *
 * A null leaf is NOT counted. Nulls in a patch are invariants - `past_treatment_describe`
 * goes null the moment side effects are answered No - and counting one as an answer would
 * inflate the number the patient is being shown.
 */
function countLeaves(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return 1;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (sum, v) => sum + countLeaves(v),
      0,
    );
  }
  return 1;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * The payload, reduced to what may be written for THIS patient.
 *
 * `lang` is here only so the "not available for your answers" reason is in the language on
 * screen; it never affects what is written, because answers are always the English schema
 * strings.
 */
export function planVoiceFill(
  payload: VoicePayload,
  key: string,
  meta: Meta,
  lang: Lang,
): VoicePlan {
  const answersOut: Partial<Answers> = {};
  const metaOut: Partial<Meta> = {};
  const blocked: string[] = [];
  let missing = asStringArray(payload.unfilled).length;

  const rawPatch =
    payload.patch !== null && typeof payload.patch === "object" && !Array.isArray(payload.patch)
      ? (payload.patch as Record<string, unknown>)
      : {};

  const mayWrite = fieldsOwnedBy(key);
  for (const [field, value] of Object.entries(rawPatch)) {
    // Not this question's to answer. Consent is the case that matters: it is a legal
    // answer key, so "is it one of the 16" would have let it through here.
    if (!mayWrite.has(field)) continue;

    if (field === "age_hair_loss_began") {
      const ceiling = maxOnsetAge(meta);
      if (typeof value !== "number" || !Number.isInteger(value)) continue;
      /*
        Out of range is DROPPED, never clamped. "It started when I was 40" from a patient
        who told us they are 34 is a contradiction, and clamping it to 34 would answer the
        question with a number nobody said. Left unanswered, the card asks again.
      */
      if (value < AGE_MIN || value > ceiling) {
        missing += 1;
        continue;
      }
      answersOut.age_hair_loss_began = value;
      continue;
    }

    if (Array.isArray(value)) {
      const allowed = allowedOptions(field, value, meta, lang);
      blocked.push(...allowed.blocked);
      /*
        An empty list after filtering is only an answer if it started empty - which is what
        a deliberate "none of these" looks like. Filtering it down to nothing means every
        option named was closed to this patient, and that is not an answer at all.
      */
      if (allowed.kept.length === 0 && value.length > 0) {
        missing += 1;
        continue;
      }
      answersOut[field as "family_history"] = allowed.kept;
      continue;
    }

    answersOut[field as keyof Answers] = value as never;
  }

  const rawMeta =
    payload.meta !== null && typeof payload.meta === "object" && !Array.isArray(payload.meta)
      ? (payload.meta as Record<string, unknown>)
      : {};

  const name = typeof rawMeta.first_name === "string" ? cleanFirstName(rawMeta.first_name) : null;
  if (name !== null) metaOut.first_name = name;
  if (isSex(rawMeta.patient_sex)) metaOut.patient_sex = rawMeta.patient_sex;
  if (
    typeof rawMeta.patient_age === "number" &&
    Number.isInteger(rawMeta.patient_age) &&
    rawMeta.patient_age >= AGE_MIN &&
    rawMeta.patient_age <= AGE_MAX
  ) {
    metaOut.patient_age = rawMeta.patient_age;
  }

  // Only the two questions that have no "None" option of their own can be recorded this
  // way; anything else claiming to be a none-escape is ignored.
  const noneOf = asStringArray(payload.noneOf).filter((k) => hasNoneEscape(k) && k === key);

  const filled = countLeaves(answersOut) + countLeaves(metaOut);
  return { answers: answersOut, meta: metaOut, noneOf, filled, missing, blocked };
}

function isSex(v: unknown): v is PatientSex {
  return v === "male" || v === "female" || v === "prefer_not";
}

/**
 * Options this patient may actually be given, and the ones that were named but are closed.
 *
 * The closed list comes from `unavailableOptions`, the same function that greys the option
 * out on screen, so the microphone and the thumb can never disagree about what is offered.
 */
function allowedOptions(
  field: string,
  named: unknown[],
  meta: Meta,
  lang: Lang,
): { kept: string[]; blocked: string[] } {
  const values = named.filter((v): v is string => typeof v === "string");
  const options = optionsFor(field);
  if (options.length === 0) return { kept: values, blocked: [] };

  const closed = unavailableOptions(field, options, meta, lang);
  const kept: string[] = [];
  const blocked: string[] = [];
  for (const v of values) {
    // Not one of this question's options at all: the server dropped those already, and
    // anything that still gets here is not an answer we can record.
    if (!options.includes(v)) continue;
    if (closed[v] !== undefined) blocked.push(v);
    else kept.push(v);
  }
  return { kept, blocked };
}

function optionsFor(field: string): readonly string[] {
  try {
    const q = getQuestion(field as QuestionKey);
    return "options" in q ? q.options : [];
  } catch {
    return [];
  }
}
