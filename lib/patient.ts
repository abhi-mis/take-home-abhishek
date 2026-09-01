/**
 * Personalisation: what the form does differently once it knows who is filling it.
 *
 * The intake asks three things before question 1 - sex, age, and optionally a first name
 * - and this file is everything that then changes. It is pure and has no imports from
 * React or the store, so every rule below is unit-testable and none of them can hide in
 * a component.
 *
 * THE ARGUMENT FOR ASKING FIRST
 * ----------------------------
 * A form that treats a 22-year-old and a 68-year-old identically has quietly optimised
 * for the 22-year-old, because that is who the person building it can see in their head.
 * Sixteen questions in 15px type, options that mention pregnancy to someone who went
 * through menopause fifteen years ago, and an age slider that lets you say your hair
 * loss started at 60 when you are 45. All three are fixed here, and they are fixed by
 * knowing two numbers.
 *
 * Nothing here fills a clinical answer. Age drives PRESENTATION (type size, tap size),
 * a hard VALIDATION bound (onset age cannot exceed current age), and SUGGESTIONS the
 * patient still has to accept. A suggestion the patient must tap is help; a pre-filled
 * answer nobody read is a fabricated medical record.
 */
import type { Answers, Meta } from "./types";

// ---------------------------------------------------------------------------
// Comfort: the reason to ask for an age at all
// ---------------------------------------------------------------------------

export type Comfort = "standard" | "large" | "xl";

export const COMFORT_ZOOM: Record<Comfort, number> = {
  standard: 1,
  large: 1.12,
  xl: 1.26,
};

export const COMFORT_LABEL: Record<Comfort, string> = {
  standard: "Standard text",
  large: "Larger text",
  xl: "Largest text",
};

/**
 * The default comfort scale for an age, applied automatically and always overridable.
 *
 * Presbyopia is near-universal from the mid-40s and most people in a clinic queue do not
 * have their reading glasses. 55 is where the default flips, not because 55 is a
 * cliff-edge but because a default has to sit somewhere, and the cost of getting it
 * slightly wrong is asymmetric: bigger text mildly annoys someone who did not need it,
 * while small text can stop someone finishing the form at all.
 *
 * Implemented as page zoom rather than a font-size scale, deliberately: zoom scales the
 * TAP TARGETS too. Larger text with 44px buttons helps someone who cannot read the
 * screen and does nothing for someone whose hands shake.
 */
export function suggestedComfort(age: number | null): Comfort {
  if (age === null) return "standard";
  if (age >= 70) return "xl";
  if (age >= 55) return "large";
  return "standard";
}

export const AGE_MIN = 16;
export const AGE_MAX = 95;

/** Coarse bands, used for copy rather than for any clinical decision. */
export function ageBand(age: number | null): string {
  if (age === null) return "";
  if (age < 25) return "under 25";
  if (age < 40) return "25 to 39";
  if (age < 55) return "40 to 54";
  if (age < 70) return "55 to 69";
  return "70 or older";
}

// ---------------------------------------------------------------------------
// Copy that knows who it is talking to
// ---------------------------------------------------------------------------

const FIRST_NAME_MAX = 24;

/**
 * A first name, cleaned up. Empty becomes null so "provided" is never ambiguous.
 *
 * Capped and stripped of anything that is not a name character, because this string is
 * interpolated into on-screen copy - and an intake form is not the place to find out
 * what happens when someone types 300 characters of markup into a greeting.
 */
export function cleanFirstName(raw: string): string | null {
  const name = raw
    .replace(/[^\p{L}\p{M}\s'.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FIRST_NAME_MAX);
  return name.length === 0 ? null : name;
}

/** "Let us begin, Anjali." - or the same sentence without the name. */
export function greeting(meta: Meta): string {
  return meta.first_name === null ? "Let us begin." : `Let us begin, ${meta.first_name}.`;
}

/** The one-line summary of what was customised, shown in the header. */
export function personalSummary(meta: Meta, comfort: Comfort): string {
  const bits: string[] = [];
  if (meta.patient_sex !== null) {
    bits.push(
      meta.patient_sex === "female" ? "Female" : meta.patient_sex === "male" ? "Male" : "Not stated",
    );
  }
  if (meta.patient_age !== null) bits.push(`${meta.patient_age}`);
  if (comfort !== "standard") bits.push(COMFORT_LABEL[comfort].toLowerCase());
  return bits.join(" · ");
}

/**
 * Extra context for a question, when this patient's answers make it worth adding.
 *
 * Only where age or sex genuinely changes what the question means. Q9 is the clearest
 * case: "more body or facial hair than usual" is a hirsutism screen for a female patient
 * and a much weaker signal for a male one, so the framing has to differ or the answer is
 * noise. The rest are there to stop a question reading as absurd.
 */
export function personalNote(key: string, meta: Meta): string | undefined {
  const age = meta.patient_age;
  const sex = meta.patient_sex;

  if (key === "excess_body_facial_hair" && sex === "female") {
    return "Compared with what is usual for you - for example on the chin, upper lip, chest or stomach.";
  }
  if (key === "pregnancy_related" && age !== null && age >= 50) {
    return "If none of these apply any more, choose Not applicable.";
  }
  if (key === "menstrual_cycle" && age !== null && age >= 50) {
    return "If your periods have stopped, choose Menopausal.";
  }
  if (key === "age_hair_loss_began" && age !== null) {
    return `You are ${age}, so this can be anywhere from ${AGE_MIN} to ${age}.`;
  }
  return undefined;
}

/**
 * The onset age can never exceed the patient's current age.
 *
 * A real validation bound, not a nicety: "my hair loss started at 60" from a 45-year-old
 * is a slider mistake, and it reaches the doctor looking like a fact. This is the whole
 * reason the age question earns its place beyond presentation.
 */
export function maxOnsetAge(meta: Meta): number {
  return meta.patient_age === null ? 90 : Math.max(AGE_MIN, meta.patient_age);
}

// ---------------------------------------------------------------------------
// Suggestions: offered, never applied
// ---------------------------------------------------------------------------

export interface Suggestion {
  value: string;
  reason: string;
}

/**
 * Q6 and Q7, answered from the patient's actual age rather than from a proxy.
 *
 * This used to guess from `age_hair_loss_began` ("your hair loss started after 50, so
 * you are probably post-menopausal"), which is a bad inference wearing a helpful hat -
 * onset age says very little about current age. With a real age it becomes an honest
 * offer, and it is still only an offer: `SingleChoice` renders it as a prompt the
 * patient has to accept, never as a selection.
 *
 * Q6 suggests "Menopausal" rather than "Not applicable" because both skip the follow-up
 * work but only one tells the doctor something. "Not applicable" reads as "I would rather
 * not say", which is a different answer.
 */
export function suggestionFor(
  key: string,
  answers: Answers,
  meta: Meta,
): Suggestion | undefined {
  const age = meta.patient_age;

  if (key === "menstrual_cycle") {
    if (age !== null && age >= 52 && answers.menstrual_cycle === null) {
      return { value: "Menopausal", reason: `You are ${age} - is this the right answer?` };
    }
    return undefined;
  }

  if (key === "pregnancy_related") {
    if (age !== null && age >= 50 && answers.pregnancy_related === null) {
      return { value: "Not applicable", reason: `You are ${age} - is this the right answer?` };
    }
    return undefined;
  }

  return undefined;
}
