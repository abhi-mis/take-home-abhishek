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
import { t, type Lang } from "./i18n";

// ---------------------------------------------------------------------------
// Comfort: the reason to ask for an age at all
// ---------------------------------------------------------------------------

export type Comfort = "standard" | "large" | "xl";

export const COMFORT_ZOOM: Record<Comfort, number> = {
  standard: 1,
  large: 1.12,
  xl: 1.26,
};

/**
 * The name of a scale, in the patient's language.
 *
 * A `Record<Comfort, string>` of English strings was fine while the app had one
 * language. It is exactly the shape that cannot be translated, so the names moved into
 * lib/copy.hi.ts and this is the accessor - which also means a missing Hindi name is a
 * compile error rather than an English word on a Hindi screen.
 */
export function comfortName(c: Comfort, lang: Lang): string {
  if (c === "large") return t("comfortLargeName", lang);
  if (c === "xl") return t("comfortXlName", lang);
  return t("comfortStandardName", lang);
}

/**
 * The comfort scale this age is OFFERED. It is never applied without an answer.
 *
 * Presbyopia is near-universal from the mid-40s and most people in a clinic queue do not
 * have their reading glasses. 55 is where the offer starts, not because 55 is a
 * cliff-edge but because the threshold has to sit somewhere.
 *
 * It used to apply itself the moment an age was entered, and that was wrong for one
 * specific reason: resizing the whole screen under someone who did not ask for it is a
 * thing being done TO them, and a 60-year-old with perfect eyesight reads it as the form
 * deciding they are old. So the form asks - once, in plain words, with a preview of both
 * sizes - and does nothing at all until they answer. See `shouldOfferComfort` below.
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

/**
 * Should the form ask about text size right now?
 *
 * Pure, and the single source of truth for a decision that would otherwise be spread
 * across an effect and two components. Every clause is a case that has to be right:
 *
 *  - there has to be something to offer (`suggestedComfort` above standard);
 *  - `chosen` means the patient already used the Aa button, and offering them something
 *    they have already decided is worse than not offering at all;
 *  - `asked` means they have answered this prompt once, either way. A prompt that
 *    reappears is a prompt that gets dismissed without being read.
 */
export function shouldOfferComfort(
  meta: Meta,
  chosen: boolean,
  asked: boolean,
): boolean {
  if (chosen || asked) return false;
  return suggestedComfort(meta.patient_age) !== "standard";
}

/**
 * The range the age field accepts.
 *
 * It was 16 to 95 while the age was picked from decade cards, where the range was implied by
 * the cards themselves. A typed field needs a real bound, and a wide one: refusing a number
 * because it is unusual is how a form tells a 96-year-old they do not exist. Anything
 * outside this is a typo rather than a person.
 */
/**
 * The one answer this form insists on, and the reason it is the exception.
 *
 * Everything else can be left blank and come back to, because a form that refuses to advance
 * produces guesses and a guess is a wrong entry in a clinical record. Sex is different in kind:
 * it is not an answer, it is what decides which QUESTIONS EXIST. Q6 (periods) and Q7
 * (pregnancy-related) are asked only of a female patient and emitted as null otherwise, so
 * without it the output carries two nulls that could mean either "does not apply" or "we never
 * found out" - and the doctor reading the file cannot tell which. One is a clinical fact, the
 * other is a gap in the record.
 */
export function sexMissing(meta: Meta): boolean {
  return meta.patient_sex === null;
}

export const AGE_MIN = 16;
export const AGE_MAX = 100;

/**
 * The youngest age hair loss is asked about, which is NOT the same number.
 *
 * `maxOnsetAge` floors the onset ceiling at ONSET_MIN rather than at AGE_MIN. The two happen
 * to be the same number now, and the indirection stays because they are different facts: one
 * is who may fill this form in, the other is the earliest age the onset question will offer.
 * They were briefly 1 and 5, and flooring at AGE_MIN then would have told a 5-year-old's
 * form that onset may be up to 5 - which is right - but flooring at 16 would have allowed 16.
 * Keeping the two bounds separate is what makes both of them mean something.
 */
/*
  16, on the clinical point that androgenetic hair loss does not present before puberty
  completes. It matches AGE_MIN by consequence, not by definition - see the note above.
*/
export const ONSET_MIN = 16;

/** Coarse bands, used for copy rather than for any clinical decision. */
export function ageBand(age: number | null, lang: Lang): string {
  if (age === null) return "";
  if (age < 25) return t("bandUnder25", lang);
  if (age < 40) return t("band25to39", lang);
  if (age < 55) return t("band40to54", lang);
  if (age < 70) return t("band55to69", lang);
  return t("band70plus", lang);
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

/**
 * The three places a name is allowed to appear, and nowhere else.
 *
 * Asking for something and then never showing it back is the worst of both worlds: the
 * patient paid the cost of typing it and got nothing, and the field reads as data
 * collection for its own sake. So the name is echoed the instant it is typed, again as a
 * welcome on the first question, and once more at the end. It still never reaches the
 * JSON - see the note in lib/types.ts.
 */

/** Echoed under the name field while the patient is still on that screen. */
export function nameAck(name: string, lang: Lang): string {
  return t("aboutNameAck", lang, { name });
}

/** "Welcome, Anjali" - null when no name was given, so the caller renders nothing. */
export function welcomeLine(meta: Meta, lang: Lang): string | null {
  return meta.first_name === null ? null : t("welcome", lang, { name: meta.first_name });
}

/** The closing heading: "All done, Anjali", or the plain version without a name. */
export function doneTitle(meta: Meta, fallback: string, lang: Lang): string {
  return meta.first_name === null
    ? fallback
    : t("withName", lang, { title: fallback, name: meta.first_name });
}

/**
 * The one-line summary of what was customised, shown in the header.
 *
 * It used to end with the comfort scale ("Female · 70 · largest text") and that was the
 * one thing on the screen that broke at the largest text size: the header is a single
 * line beside three controls, so it truncated to "Female · 70 · largest t...", which
 * reads as a bug rather than as a setting. The scale is already stated by the Aa button
 * sitting an inch to the right - it turns brand-coloured and its label says which step it
 * is on - so the line keeps only what nothing else shows.
 */
export function personalSummary(meta: Meta, lang: Lang): string {
  const bits: string[] = [];
  if (meta.patient_sex !== null) {
    bits.push(
      meta.patient_sex === "female"
        ? t("sexFemale", lang)
        : meta.patient_sex === "male"
          ? t("sexMale", lang)
          : t("sexNotStated", lang),
    );
  }
  if (meta.patient_age !== null) bits.push(`${meta.patient_age}`);
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
export function personalNote(key: string, meta: Meta, lang: Lang): string | undefined {
  const age = meta.patient_age;
  const sex = meta.patient_sex;

  if (key === "excess_body_facial_hair" && sex === "female") {
    return t("noteHirsutism", lang);
  }
  if (key === "pregnancy_related" && age !== null && age >= 50) {
    return t("notePregnancyOlder", lang);
  }
  if (key === "menstrual_cycle" && age !== null && age >= 50) {
    return t("noteMenopause", lang);
  }
  if (key === "age_hair_loss_began" && age !== null) {
    return t("noteOnsetRange", lang, { age, min: ONSET_MIN });
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
  return meta.patient_age === null ? 90 : Math.max(ONSET_MIN, meta.patient_age);
}

// ---------------------------------------------------------------------------
// Options this patient cannot truthfully pick
// ---------------------------------------------------------------------------

/**
 * Why an option is unavailable to THIS patient, or undefined when it is fine.
 *
 * Two different things, and only one of them is a UI nicety:
 *
 *  - PCOS/PCOD is a disorder of the ovaries. Offering it to a male patient is not just
 *    untidy, it is a route to a diagnosis in the output that cannot be true.
 *  - An onset age above the patient's current age is arithmetically impossible. The
 *    slider was already bounded; the decade cards above it were not, so tapping "50+"
 *    at 25 silently set 25 and looked like the app ignoring the tap.
 *
 * The options are still RENDERED, greyed and unpressable with the reason stated. Removing
 * them would be worse: a patient who came in believing they have PCOS needs to see that
 * the form considered it and why it is closed, not to find the option missing and wonder
 * whether they picked the wrong sex earlier.
 *
 * Note what is deliberately NOT here: "Menopausal" stays available at any age. Premature
 * ovarian insufficiency exists, and a form that refuses to record it because the patient
 * is 29 has decided it knows better than the patient about her own body.
 */
export function optionUnavailable(
  key: string,
  option: string,
  meta: Meta,
  lang: Lang,
): string | undefined {
  if (
    key === "diagnosed_conditions" &&
    option === "PCOS/PCOD" &&
    meta.patient_sex === "male"
  ) {
    return t("unavailablePcos", lang);
  }
  return undefined;
}

/** The same rule as a map, ready to hand to a multi-select. */
export function unavailableOptions(
  key: string,
  options: readonly string[],
  meta: Meta,
  lang: Lang,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of options) {
    const why = optionUnavailable(key, o, meta, lang);
    if (why !== undefined) out[o] = why;
  }
  return out;
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
  lang: Lang,
): Suggestion | undefined {
  const age = meta.patient_age;
  const reason = age === null ? "" : t("suggestionReason", lang, { age });

  if (key === "menstrual_cycle") {
    if (age !== null && age >= 52 && answers.menstrual_cycle === null) {
      return { value: "Menopausal", reason };
    }
    return undefined;
  }

  if (key === "pregnancy_related") {
    if (age !== null && age >= 50 && answers.pregnancy_related === null) {
      return { value: "Not applicable", reason };
    }
    return undefined;
  }

  return undefined;
}
