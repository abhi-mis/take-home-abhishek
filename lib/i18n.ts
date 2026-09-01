/**
 * One language at a time, and one place that decides which.
 *
 * The form is bilingual English / Hindi, and the rule the patient sees is simple: the
 * whole screen is in one language. No bracketed English after every Hindi label, no
 * "PCOS/PCOD (पीसीओएस)" - a form that says everything twice is harder to read in both
 * languages than a form that commits to one.
 *
 * THE INVARIANT THAT MATTERS MORE THAN THE TRANSLATION
 * ---------------------------------------------------
 * Language is presentation. The answers are not translated, ever. A patient who taps
 * "अनियमित" stores `"Irregular"`, because lib/schema.ts is the contract with the doctor
 * and the downloaded JSON has to be identical whichever language the form was filled in.
 * `optionLabel` therefore only ever maps English -> Hindi for display, never back, and
 * nothing in this file touches `Answers`.
 *
 * Everything here is pure and synchronous. Components read `lang` from the store and call
 * these functions; there is no context, no provider and no async dictionary load, because
 * the entire copy of both languages is a few kilobytes of the bundle already.
 */
import type { QuestionKey } from "./schema";
import { COPY, SECTION_LABEL, SPEAK_PROMPTS, UI_COPY, type QuestionCopy, type SpeakPrompt } from "./copy";
import {
  COPY_HI,
  OPTION_HI,
  SECTION_LABEL_HI,
  SPEAK_PROMPTS_HI,
  TEXT_EN,
  TEXT_HI,
  UI_COPY_HI,
  type TextKey,
} from "./copy.hi";

export type Lang = "en" | "hi";

export const LANGS: Lang[] = ["en", "hi"];

/** What the toggle shows for each language: its own name, in its own script. */
export const LANG_NAME: Record<Lang, string> = {
  en: "English",
  hi: "हिंदी",
};

/** Two letters for a 380px header. */
export const LANG_SHORT: Record<Lang, string> = {
  en: "EN",
  hi: "हिं",
};

/**
 * The voice used for read-aloud.
 *
 * `hi-IN` for Hindi, and `en-IN` for English because these are Indian patients and an
 * Indian-English voice reads names and place names correctly where a US voice does not.
 * Both are preferences: lib/speak.ts falls back to any available voice rather than going
 * silent, since a robotic voice beats no voice for someone who cannot read the screen.
 */
export const SPEECH_LANG: Record<Lang, string> = {
  en: "en-IN",
  hi: "hi-IN",
};

/** HTML `lang` attribute, which is also what a screen reader picks its voice from. */
export const HTML_LANG: Record<Lang, string> = {
  en: "en-IN",
  hi: "hi",
};

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function questionCopy(lang: Lang): Record<QuestionKey, QuestionCopy> {
  return lang === "hi" ? COPY_HI : COPY;
}

export function ui(lang: Lang): Record<keyof typeof UI_COPY, string> {
  return lang === "hi" ? UI_COPY_HI : UI_COPY;
}

export function sectionLabel(lang: Lang): Record<string, string> {
  return lang === "hi" ? SECTION_LABEL_HI : SECTION_LABEL;
}

export function speakPrompts(lang: Lang): Record<string, SpeakPrompt> {
  return lang === "hi" ? SPEAK_PROMPTS_HI : SPEAK_PROMPTS;
}

/**
 * A schema option, as the patient should read it.
 *
 * Falls back to the English string when a translation is missing. That is deliberate: a
 * missing label shows up as one English option among Hindi ones - visible, obvious, and
 * still answerable - rather than as a blank card or a thrown error in a clinic. The i18n
 * test walks the schema so this fallback should never fire in practice.
 */
export function optionLabel(option: string, lang: Lang): string {
  if (lang === "en") return option;
  return OPTION_HI[option] ?? option;
}

/**
 * A component string, with `{placeholder}` substitution.
 *
 * `t("welcome", lang, { name: "Asha" })`. Placeholders are named rather than positional
 * because Hindi word order differs from English: "{total} में से सवाल {n}" has to be
 * free to put the total first.
 */
export function t(key: TextKey, lang: Lang, vars?: Record<string, string | number>): string {
  const template = lang === "hi" ? TEXT_HI[key] : TEXT_EN[key];
  return vars === undefined ? template : fill(template, vars);
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
