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
import { COPY, SPEAK_PROMPTS, UI_COPY } from "./copy";
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

/** Joins the option list the way a person reads a list aloud. */
function readList(options: readonly string[]): string {
  if (options.length === 0) return "";
  if (options.length === 1) return options[0] ?? "";
  return `${options.slice(0, -1).join(", ")}, or ${options[options.length - 1]}`;
}

export function questionSpeech(step: Step, meta: Meta): string {
  if (step.kind === "about") {
    return [
      UI_COPY.aboutTitle,
      UI_COPY.aboutBody,
      "Your name is optional. Then choose female, male, or prefer not to say, and set your age.",
    ]
      .join(" ")
      .replace(/\s+/g, " ");
  }

  const key = step.key;
  if (key === null) return "";
  const copy = COPY[key];
  const parts: string[] = [];
  // Question 1 prints a welcome, so question 1 speaks it. The button reads the screen; if
  // the two ever diverge, a patient who cannot see the screen is getting a different form.
  if (step.n === 1) {
    const hello = welcomeLine(meta);
    if (hello !== null) parts.push(`${hello}.`);
  }
  parts.push(copy?.title ?? key);

  const hint = SPOKEN_HINT[key] ?? copy?.hint;
  if (hint) parts.push(hint);
  // The same personalised note the screen shows, so the ear and the eye get one question.
  const note = personalNote(key, meta);
  if (note) parts.push(note);

  switch (step.kind) {
    case "single":
    case "multi": {
      const q = getQuestion(key);
      const options = "options" in q ? q.options : [];
      if (options.length > 0) {
        parts.push(`The choices are: ${readList(options)}.`);
      }
      if (hasNoneEscape(key)) parts.push(`Or, ${UI_COPY.none.toLowerCase()}.`);
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
      const prompt = SPEAK_PROMPTS[key];
      if (prompt) {
        parts.push(prompt.intro, ...prompt.points.map((p, i) => `${i + 1}. ${p}.`));
        if (prompt.detailNote) parts.push(prompt.detailNote);
      }
      break;
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
