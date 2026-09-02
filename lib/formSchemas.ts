/**
 * Zod schemas for the form's TYPED fields, and only those.
 *
 * The intake has exactly three inputs a patient types into - their name, their age, and the
 * side-effect description - and those three are what React Hook Form now drives. Everything
 * else in the form is a choice control: a radio, a checkbox, a segmented row. Those are
 * validated by `lib/steps.ts` against the published schema, which knows things a form library
 * cannot ("Q6 must be null unless the patient is female", "a row's detail columns must be null
 * while its flag is false"), and their values are written straight to a persisted store. Wiring
 * them through a second validation layer would add indirection without adding a single check.
 *
 * So the split is deliberate: RHF owns the fields where typing can go wrong, and the schema
 * owns the clinical rules. What RHF actually buys at those three fields is worth naming - the
 * rule and its message live together instead of being re-derived inline, error state is one
 * object rather than three booleans, and the aria wiring comes from the field rather than from
 * whoever remembers it.
 *
 * The messages are translated, so a schema is built per language rather than declared once.
 */
import { z } from "zod";
import { AGE_MAX, AGE_MIN } from "./patient";
import { t, type Lang } from "./i18n";

/** How the age box is allowed to look while it is being typed into. */
export function ageFieldSchema(lang: Lang) {
  const message = t("aboutAgeRangeError", lang, { min: AGE_MIN, max: AGE_MAX });
  return (
    z
      .string()
      /*
        Empty is VALID here, and that is not an oversight.
        A blank age is "not answered yet", which is a section-completeness question, not a
        field error - and `validateSection` already blocks Next on it. Colouring the box red
        the moment a patient focuses it and types nothing would be the form telling someone
        off for arriving.
      */
      .refine((v) => v === "" || /^\d+$/.test(v), { message })
      .refine((v) => v === "" || (Number(v) >= AGE_MIN && Number(v) <= AGE_MAX), { message })
  );
}

export function aboutFormSchema(lang: Lang) {
  return z.object({
    // Trimmed and length-capped in lib/patient.ts on the way to the store; the field itself
    // accepts anything, because there is no such thing as a wrong name.
    firstName: z.string(),
    age: ageFieldSchema(lang),
  });
}

export type AboutFormValues = z.infer<ReturnType<typeof aboutFormSchema>>;

/**
 * The side-effect description, required only once the patient has said there were any.
 *
 * `validate.ts` rejects the output if `past_treatment_side_effects` is true with an empty
 * description, so this is the same rule stated where the patient can act on it.
 */
export function describeFormSchema(lang: Lang) {
  return z.object({
    describe: z.string().trim().min(1, { message: t("sideEffectRequired", lang) }),
  });
}

export type DescribeFormValues = z.infer<ReturnType<typeof describeFormSchema>>;

/** Digits only, no leading zeros, three at most. Shared by the field and its tests. */
export function normaliseAgeInput(raw: string): string {
  return raw
    .replace(/[^0-9]/g, "")
    .slice(0, 3)
    .replace(/^0+(?=\d)/, "");
}

/**
 * The number to store for what is currently in the box, or null.
 *
 * Null means NOT ANSWERED, and an out-of-range value must map to it. Committing only valid
 * values sounds safer and is worse: type 120 over a stored 12 and the screen shows 120 with an
 * error while the form quietly holds 12, counts the question answered, and lets the patient
 * leave. Clearing it makes the section incomplete, which is the truth.
 */
export function ageToStore(raw: string): number | null {
  if (raw === "" || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= AGE_MIN && n <= AGE_MAX ? n : null;
}
