/**
 * Questions, grouped the way the doctor already groups them.
 *
 * The wizard used to be seventeen flat steps, one per screen. It is six sections now, and
 * this module is the whole structural answer: what is in a section, what this patient can
 * see of it, how much is done, and which question to open next. Seventeen screens of
 * identical chrome is its own kind of fatigue; chunking into the schema's own categories
 * keeps one question asking at a time while cutting navigations from seventeen to six.
 *
 * Two boundaries make it easy to trust:
 *
 *  - "Answered" is not reimplemented here. It delegates to `validateStep`, so a section
 *    and the question inside it can never disagree about whether it is done.
 *  - No copy and no language. Every function returns Steps, never labels, so the UI owns
 *    the words and this file stays pure enough to test without a DOM or a dictionary.
 */
import { ALL_STEPS, isStepVisible, validateStep, type Step } from "./steps";
import type { Answers, Meta } from "./types";

export interface Section {
  /** "0" for About You, then the schema's own section ids. */
  id: string;
  /** Every question in the section, gating ignored, in schema order. */
  steps: Step[];
}

/**
 * Built by grouping ALL_STEPS, which already puts About You first and then follows schema
 * order. A question added to lib/schema.ts therefore lands in the right section with no
 * edit here, which was the point of deriving the wizard from the schema in the first place.
 */
export const ALL_SECTIONS: Section[] = (() => {
  const order: string[] = [];
  const bySection = new Map<string, Step[]>();
  for (const step of ALL_STEPS) {
    const existing = bySection.get(step.sectionId);
    if (existing === undefined) {
      order.push(step.sectionId);
      bySection.set(step.sectionId, [step]);
    } else {
      existing.push(step);
    }
  }
  return order.map((id) => ({ id, steps: bySection.get(id) ?? [] }));
})();

export function sectionById(id: string): Section | undefined {
  return ALL_SECTIONS.find((s) => s.id === id);
}

/** Position in the flow, 0-based. Falls back to the first section for an unknown id. */
export function sectionIndexById(id: string): number {
  const i = ALL_SECTIONS.findIndex((s) => s.id === id);
  return i === -1 ? 0 : i;
}

/** The questions this patient is actually asked, after the sex gate. */
export function visibleQuestions(section: Section, meta: Meta): Step[] {
  return section.steps.filter((s) => isStepVisible(s, meta));
}

export function isAnswered(
  step: Step,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): boolean {
  return validateStep(step, answers, meta, explicitNone).complete;
}

export function answeredCount(
  section: Section,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): number {
  return visibleQuestions(section, meta).filter((s) => isAnswered(s, answers, meta, explicitNone))
    .length;
}

export interface SectionValidation {
  complete: boolean;
  /** The unanswered visible questions, in order, for the UI to name. */
  missing: Step[];
}

export function validateSection(
  section: Section,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): SectionValidation {
  const missing = visibleQuestions(section, meta).filter(
    (s) => !isAnswered(s, answers, meta, explicitNone),
  );
  return { complete: missing.length === 0, missing };
}

export function firstUnanswered(
  section: Section,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): Step | null {
  return validateSection(section, answers, meta, explicitNone).missing[0] ?? null;
}

/**
 * The next unanswered question after `from`, or null.
 *
 * Deliberately does not wrap. Answering the last question in a section should leave the
 * patient looking at a finished section with Next available, not bounced back to the top to
 * hunt for what they missed - the outstanding list does that job explicitly, and only once
 * they try to leave.
 */
export function nextUnansweredAfter(
  section: Section,
  from: Step,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): Step | null {
  const visible = visibleQuestions(section, meta);
  const at = visible.findIndex((s) => s.id === from.id);
  if (at === -1) return firstUnanswered(section, answers, meta, explicitNone);
  for (const step of visible.slice(at + 1)) {
    if (!isAnswered(step, answers, meta, explicitNone)) return step;
  }
  return null;
}

/**
 * The visible question immediately before or after `from`, answered or not.
 *
 * This is the keyboard's Up and Down, which move between cards rather than hunting for
 * work: a patient who wants to look back at what they just answered should be able to.
 */
export function neighbourQuestion(
  section: Section,
  from: Step,
  meta: Meta,
  direction: -1 | 1,
): Step | null {
  const visible = visibleQuestions(section, meta);
  const at = visible.findIndex((s) => s.id === from.id);
  if (at === -1) return null;
  return visible[at + direction] ?? null;
}
