/**
 * What the speaker button reads out for a question.
 *
 * The point of reading a question aloud is not decoration - it is for the patient who
 * cannot read the screen comfortably: small type, a second language, no glasses in the
 * clinic bag. So it has to read the ANSWERS too, not just the question. "Where are you
 * losing hair?" spoken alone tells that patient nothing they can act on; the six options
 * are the part they need.
 *
 * Everything here is derived from the schema and lib/copy.ts, so a question added to
 * lib/schema.ts becomes speakable with no edit, and the spoken wording can never drift
 * from the printed wording - they are the same strings.
 *
 * Pure, so it is trivially testable and safe to import anywhere.
 */
import { getQuestion, type QuestionKey } from "./schema";
import { optionLabel, questionCopy, speakPrompts, t, ui, type Lang } from "./i18n";
import { hasNoneEscape, type Meta } from "./types";
import { personalNote, welcomeLine } from "./patient";
import type { Step } from "./steps";

/**
 * Hints written for the eye, and their spoken equivalents.
 *
 * A few hints instruct the reader to tap something ("Tap the pictures that look closest
 * to you"), which is exactly the wrong thing to say to someone who asked to have the
 * question read to them - and faintly absurd out loud. Only those are rewritten; every
 * other hint is spoken as printed.
 */
const SPOKEN_HINT: Partial<Record<QuestionKey, string>> = {
  pattern: "More than one can apply.",
  age_hair_loss_began: "A rough age is fine.",
  family_history: "More than one can apply.",
  products: "Answer for all five.",
  procedures: "Answer for all four.",
};

/**
 * Joins the option list the way a person reads a list aloud.
 *
 * The conjunction is a translated word rather than a hardcoded "or", because a spoken
 * list is the one place where a stray English word is most jarring: it lands in the
 * middle of a Hindi sentence in a different voice model.
 */
function readList(options: readonly string[], lang: Lang): string {
  if (options.length === 0) return "";
  if (options.length === 1) return options[0] ?? "";
  const last = options[options.length - 1];
  return `${options.slice(0, -1).join(", ")}, ${t("speechOr", lang)} ${last}`;
}

export function questionSpeech(step: Step, meta: Meta, lang: Lang): string {
  const UI = ui(lang);
  const COPY_L = questionCopy(lang);
  if (step.kind === "about") {
    return [UI.aboutTitle, UI.aboutBody, UI.aboutFooter].join(" ").replace(/\s+/g, " ");
  }

  const key = step.key;
  if (key === null) return "";
  const copy = COPY_L[key];
  const parts: string[] = [];
  // Question 1 prints a welcome, so question 1 speaks it. The button reads the screen; if
  // the two ever diverge, a patient who cannot see the screen is getting a different form.
  if (step.n === 1) {
    const hello = welcomeLine(meta, lang);
    if (hello !== null) parts.push(`${hello}.`);
  }
  parts.push(copy?.title ?? key);

  // The eye-only hints ("tap the pictures") are rewritten for the ear, but only in
  // English: the Hindi hints were written to be read aloud in the first place.
  const hint = (lang === "en" ? SPOKEN_HINT[key] : undefined) ?? copy?.hint;
  if (hint) parts.push(hint);
  // The same personalised note the screen shows, so the ear and the eye get one question.
  const note = personalNote(key, meta, lang);
  if (note) parts.push(note);

  switch (step.kind) {
    case "single":
    case "multi": {
      const q = getQuestion(key);
      const options = "options" in q ? q.options : [];
      if (options.length > 0) {
        parts.push(`${t("speechChoices", lang)} ${readList(options.map((o) => optionLabel(o, lang)), lang)}.`);
      }
      if (hasNoneEscape(key)) parts.push(`${UI.none}.`);
      break;
    }

    case "yesno":
    case "consent":
      parts.push("Answer yes or no.");
      break;

    case "yesno_describe":
      parts.push("Answer yes or no. If yes, please describe what happened.");
      break;

    case "number":
      parts.push("Choose the closest age range, then adjust it.");
      break;

    case "table": {
      // The tables already have a spoken script: the enumerated checklist the voice
      // panel prints. Reusing it means the button and the microphone prompt cannot
      // disagree about what a complete answer covers.
      const prompt = speakPrompts(lang)[key];
      if (prompt) {
        parts.push(prompt.intro, ...prompt.points.map((p, i) => `${i + 1}. ${p}.`));
        if (prompt.detailNote) parts.push(prompt.detailNote);
      }
      break;
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
