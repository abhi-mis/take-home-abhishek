/**
 * Keys to intentions. No DOM, no store, no side effects.
 *
 * The rule that shaped this file: a number key SELECTS and never advances. Auto-advance was
 * removed from this form because a mis-tap that both records an answer and leaves the screen
 * produces a wrong clinical answer the patient never sees again, and a keyboard shortcut
 * that advances is the same bug with a different input device.
 *
 * Being pure is what makes the rules checkable. "Enter does nothing while the open question
 * is unanswered" is one line here and an untestable tangle inside a keydown handler.
 */
import { getQuestion } from "./schema";
import type { Step } from "./steps";

export type KeyAction =
  | { t: "select"; index: number }
  | { t: "nextQuestion" }
  | { t: "nextSection" }
  | { t: "moveUp" }
  | { t: "moveDown" }
  | { t: "close" };

export interface KeyContext {
  /** How many options the open card offers. Numbers past this are ignored. */
  optionCount: number;
  openAnswered: boolean;
  /** True when focus is in a text field. Then the keyboard belongs to the patient. */
  typing: boolean;
}

export function keyAction(
  e: { key: string; shiftKey: boolean },
  ctx: KeyContext,
): KeyAction | null {
  // A patient typing a salon treatment name into a text field must be able to type "1".
  if (ctx.typing) return null;

  if (/^[1-9]$/.test(e.key)) {
    const index = Number(e.key) - 1;
    return index < ctx.optionCount ? { t: "select", index } : null;
  }

  switch (e.key) {
    case "Enter":
      // Nothing to confirm yet: silence is better than moving on from a blank answer.
      if (!ctx.openAnswered) return null;
      return e.shiftKey ? { t: "nextSection" } : { t: "nextQuestion" };
    case "ArrowDown":
      return { t: "moveDown" };
    case "ArrowUp":
      return { t: "moveUp" };
    case "Escape":
      return { t: "close" };
    default:
      return null;
  }
}

/**
 * The options a number key can reach on this question.
 *
 * Yes/no questions have two options that are not in the schema's `options` array, and the
 * three table questions plus About You have none a single keystroke could sensibly pick -
 * a table is five rows deep, and About You is a name field and two pickers.
 */
export function optionsForStep(step: Step): readonly string[] {
  if (step.key === null) return [];
  switch (step.kind) {
    case "single":
    case "multi": {
      const q = getQuestion(step.key);
      return "options" in q ? q.options : [];
    }
    case "yesno":
    case "yesno_describe":
    case "consent":
      // Index 0 is yes, index 1 is no. The labels come from the copy layer.
      return ["yes", "no"];
    default:
      return [];
  }
}

export function optionCountForStep(step: Step): number {
  return optionsForStep(step).length;
}

/**
 * Toggle one option of a multi-select, honouring its exclusive option.
 *
 * Lives here rather than inside MultiChoice because the keyboard needs the identical rule:
 * "None of these" clears everything, and picking anything else clears "None". Two copies of
 * that would drift, and the drift would be a patient with `["Anemia", "None"]` in a
 * clinical record.
 */
export function toggleMulti(
  values: readonly string[],
  option: string,
  exclusive: string | undefined,
): string[] {
  if (exclusive !== undefined && option === exclusive) {
    return values.includes(option) ? [] : [option];
  }
  const withoutExclusive =
    exclusive === undefined ? [...values] : values.filter((v) => v !== exclusive);
  return withoutExclusive.includes(option)
    ? withoutExclusive.filter((v) => v !== option)
    : [...withoutExclusive, option];
}
