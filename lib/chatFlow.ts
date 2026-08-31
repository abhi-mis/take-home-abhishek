/**
 * The conversation driver: given the answers so far, what does the assistant ask next?
 *
 * This is the whole brain of chat mode, and it is deliberately a set of PURE functions
 * with no React, no store and no fetch in sight - so the entire 16-question
 * conversation can be walked in a unit test (tests/chatFlow.test.ts does exactly that,
 * and asserts the result passes the same Zod validator as the form's output).
 *
 * THE ONE IDEA THAT MAKES THIS SAFE
 * ---------------------------------
 * It does not own a script. There is no list of questions here, no "step 7 of 16", no
 * state machine to keep in sync with the form. `nextTurn()` scans the SAME
 * `visibleSteps(meta)` the wizard renders, asks the SAME `validateStep()` whether each
 * one is satisfied, and stops at the first that is not. Consequences:
 *
 *   - the two modes cannot drift. A question added to lib/schema.ts appears in the
 *     conversation with no edit here, and the chat's finishing line means exactly what
 *     the form's Next button means: validateStep passed;
 *   - a patient can switch modes mid-form, in either direction, at any question, and
 *     just carry on. Both modes read and write one store;
 *   - conditional detail questions come from lib/followups.ts - the same descriptors
 *     the grid uses - so "Do you use Topical Minoxidil? Yes" leads to "How long?",
 *     "Did it help?", "Any side effects?" in the conversation for the same reason it
 *     does in the form. Layered questions get ASKED, not revealed.
 *
 * WHAT THE MODEL IS AND IS NOT ALLOWED TO DO
 * ------------------------------------------
 * A typed or spoken reply goes to the model only when it has to. `interpretLocally()`
 * resolves the easy cases with no API call at all - a tapped chip, "yes", "no", a bare
 * number, an option repeated verbatim, "none of these" - which is most replies, and is
 * why the conversation feels instant. Free prose ("my mum and my sister both lost
 * hair") is what the model is for.
 *
 * Consent is never interpreted by the model, in either mode. It is a tap, or the
 * patient's own typed yes/no - never a model's reading of prose. It is absent from
 * EXTRACT_KEYS, so the route would refuse it even if this file asked.
 */
import { COPY, SPEAK_PROMPTS } from "./copy";
import { getQuestion, type QuestionKey } from "./schema";
import { outstandingFieldsFor, validateStep, visibleSteps, type Step } from "./steps";
import { answeredFieldsFor, type OutstandingField } from "./followups";
import { hasNoneEscape, EXCLUSIVE_OPTIONS, type Answers, type Meta, type PatientSex } from "./types";
import { fieldOps, type Ops } from "./apply";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** What the current turn is asking for, and therefore how a reply is applied. */
export type Ask =
  | { t: "sex" }
  | { t: "question"; questionKey: QuestionKey; input: InputKind }
  | { t: "field"; questionKey: string; field: OutstandingField }
  | { t: "describe" }
  | { t: "consent" }
  | { t: "done" };

export type InputKind = "single" | "multi" | "yesno" | "number" | "table";

export type QuickValue =
  | { t: "option"; option: string }
  | { t: "bool"; b: boolean }
  | { t: "number"; n: number }
  | { t: "none" }
  | { t: "sex"; sex: PatientSex }
  /**
   * "Ask me one at a time" on an open table question.
   *
   * Not a cosmetic preference - it is the tap-only path through Q11/Q12/Q13, and
   * without it those three questions can ONLY be answered by speaking or typing into
   * the model. That would mean a missing API key, a rate limit or a transcriber that
   * cannot read someone's accent leaves the conversation with no way forward at all.
   * The form has exactly this escape ("I would rather answer by tapping"); the
   * conversation needs its own.
   */
  | { t: "fields"; questionKey: string };

export interface QuickReply {
  label: string;
  /** Plain-English explanation under the chip, from COPY[key].gloss. */
  gloss?: string;
  value: QuickValue;
  /** Q4 only: render the scalp diagram for this option instead of a plain chip. */
  diagram?: string;
}

export interface Turn {
  /** Stable per question+field, so the UI never speaks the same line twice. */
  id: string;
  ask: Ask;
  /** The line the assistant shows AND speaks. */
  say: string;
  /** Enumerated items for a table question - every row, so nothing goes unasked. */
  points?: string[];
  /** The conditional layer, stated up front so one reply can complete a row. */
  detailNote?: string;
  /** Shown, never spoken: an example is guidance, not part of the question. */
  example?: string;
  quick: QuickReply[];
  /** Several chips may be picked before sending (multi-selects only). */
  multiSelect: boolean;
  /** Typing and the microphone are accepted for this turn. */
  freeText: boolean;
  /** Section this turn belongs to; the UI announces it when it changes. */
  section: string | null;
  progress: { answered: number; total: number };
}

// ---------------------------------------------------------------------------
// Chat-specific copy
//
// The form's hints talk about tapping ("Tap the pictures that look closest to you"),
// which is wrong in a conversation and worse when spoken aloud. So a question's TITLE
// is shared with the form - one wording for one question, and the doctor's form and the
// assistant ask identically - while the trailing guidance is chat's own.
// ---------------------------------------------------------------------------

export const CHAT_ADDENDUM: Partial<Record<string, string>> = {
  age_hair_loss_began: "A rough age is fine.",
  family_history: "You can name more than one person.",
  pattern: "Pick every area that applies - the pictures may help.",
  diagnosed_conditions: "Only what a doctor has actually confirmed.",
  past_6_months: "Say any that apply, or say none of these.",
  menstrual_cycle: "Hormones affect hair directly, which is why we ask.",
  excess_body_facial_hair: "More than normal, by your own judgement.",
  sample_type: "Both give the same result. Saliva needs no needle.",
};

/**
 * Age presets, mirroring the form's NumberStepper.
 *
 * Duplicated rather than imported: NumberStepper is a client component, and pulling a
 * component module into this pure one would drag JSX into the unit tests for the sake
 * of five numbers. The five decades are a UI convenience, not schema - the schema says
 * "number" - so a drift here cannot produce an invalid answer.
 */
export const AGE_PRESETS = [
  { label: "Teens", gloss: "13-19", value: 16 },
  { label: "20s", gloss: "20-29", value: 25 },
  { label: "30s", gloss: "30-39", value: 35 },
  { label: "40s", gloss: "40-49", value: 45 },
  { label: "50+", gloss: "50 or later", value: 55 },
] as const;

const SEX_CHOICES: { label: string; sex: PatientSex }[] = [
  { label: "Female", sex: "female" },
  { label: "Male", sex: "male" },
  { label: "Prefer not to say", sex: "prefer_not" },
];

// ---------------------------------------------------------------------------
// nextTurn
// ---------------------------------------------------------------------------

export interface TurnOptions {
  /**
   * Question keys to ask field-by-field instead of as one open question.
   *
   * Set after a free-text reply to a table question yields nothing usable. Without it,
   * a patient whose accent or phrasing the model cannot read would be asked the same
   * six-part question forever. With it, the conversation falls back to one small
   * question at a time - the same escape the form offers with "I would rather tap".
   */
  preferFields?: readonly string[];
}

/** The first unsatisfied step, asked. */
export function nextTurn(
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true> = {},
  opts: TurnOptions = {},
): Turn {
  const steps = visibleSteps(meta);
  const total = steps.length;
  let answered = 0;

  for (const step of steps) {
    if (validateStep(step, answers, meta, explicitNone).complete) {
      answered += 1;
      continue;
    }
    return buildTurn(step, answers, { answered, total }, opts);
  }

  return {
    id: "done",
    ask: { t: "done" },
    say: DONE_LINE,
    quick: [],
    multiSelect: false,
    freeText: false,
    section: null,
    progress: { answered: total, total },
  };
}

export const DONE_LINE =
  "That is everything - thank you. Your form is complete and ready for your doctor. You can review every answer and download it now.";

function buildTurn(
  step: Step,
  answers: Answers,
  progress: { answered: number; total: number },
  opts: TurnOptions,
): Turn {
  const base = {
    section: step.kind === "sexgate" ? null : step.sectionTitle,
    progress,
  };

  if (step.kind === "sexgate") {
    return {
      ...base,
      id: "sex",
      ask: { t: "sex" },
      say: "A couple of questions only apply to some patients, so we will skip the rest for you. Are you female, male, or would you rather not say?",
      quick: SEX_CHOICES.map((c) => ({ label: c.label, value: { t: "sex", sex: c.sex } as QuickValue })),
      multiSelect: false,
      freeText: true,
    };
  }

  const key = step.key as QuestionKey;
  const copy = COPY[key];
  const gloss = copy?.gloss;
  const say = [copy?.title ?? key, CHAT_ADDENDUM[key]].filter(Boolean).join(" ");

  switch (step.kind) {
    case "number":
      return {
        ...base,
        id: key,
        ask: { t: "question", questionKey: key, input: "number" },
        say,
        quick: AGE_PRESETS.map((p) => ({
          label: p.label,
          gloss: p.gloss,
          value: { t: "number", n: p.value } as QuickValue,
        })),
        multiSelect: false,
        freeText: true,
      };

    case "single": {
      const q = getQuestion(key);
      const options = "options" in q ? q.options : [];
      return {
        ...base,
        id: key,
        ask: { t: "question", questionKey: key, input: "single" },
        say,
        quick: options.map((o) => ({
          label: o,
          gloss: gloss?.[o],
          value: { t: "option", option: o } as QuickValue,
        })),
        multiSelect: false,
        freeText: true,
      };
    }

    case "multi": {
      const q = getQuestion(key);
      const options = "options" in q ? q.options : [];
      const quick: QuickReply[] = options.map((o) => ({
        label: o,
        gloss: gloss?.[o],
        value: { t: "option", option: o } as QuickValue,
        // Q4 is the picture question in the form; it stays a picture question here.
        diagram: key === "pattern" ? o : undefined,
      }));
      // The two questions with no "none" option in the schema get the UI-only escape,
      // so "nothing applies" is a real answer rather than a stuck screen.
      if (hasNoneEscape(key)) quick.push({ label: "None of these", value: { t: "none" } });
      return {
        ...base,
        id: key,
        ask: { t: "question", questionKey: key, input: "multi" },
        say,
        quick,
        multiSelect: true,
        freeText: true,
      };
    }

    case "yesno":
      return {
        ...base,
        id: key,
        ask: { t: "question", questionKey: key, input: "yesno" },
        say,
        quick: YES_NO,
        multiSelect: false,
        freeText: true,
      };

    case "consent":
      return {
        ...base,
        id: "consent",
        ask: { t: "consent" },
        say: "Last one. Do you agree to your sample being used for this genetic hair test, and to your answers being shared with your doctor?",
        // Yes/No only, and nothing is pre-selected. Consent is a decision, not a default.
        quick: YES_NO,
        multiSelect: false,
        freeText: true,
      };

    case "yesno_describe": {
      if (answers.past_treatment_side_effects === null) {
        return {
          ...base,
          id: key,
          ask: { t: "question", questionKey: key, input: "yesno" },
          say: `${copy?.title ?? key} Have you had any? For example itching, burning, headaches, dizziness, or more shedding.`,
          quick: YES_NO,
          multiSelect: false,
          freeText: true,
        };
      }
      // Answered yes, so the description is what is outstanding.
      return {
        ...base,
        id: "past_treatment_describe",
        ask: { t: "describe" },
        say: "What happened, and which treatment caused it?",
        quick: [],
        multiSelect: false,
        freeText: true,
      };
    }

    case "table": {
      const outstanding = outstandingFieldsFor(key, answers);
      const started = answeredFieldsFor(key, answers).length > 0;
      const forceFields = (opts.preferFields ?? []).includes(key);

      /**
       * Two modes for a table question, and which one is right depends entirely on
       * whether the patient has started it.
       *
       * Nothing answered yet -> ask the whole thing once, enumerated. One reply can
       * fill six fields, which is the entire reason voice is here.
       *
       * Partly answered -> ask the outstanding fields one at a time, in the order
       * lib/followups.ts returns them (which puts each conditional immediately after
       * its own trigger). Re-reading the full six-part question when four parts are
       * already answered would be maddening, and spoken aloud it is worse.
       */
      if (!started && !forceFields && outstanding.length > 0) {
        const prompt = SPEAK_PROMPTS[key];
        return {
          ...base,
          id: key,
          ask: { t: "question", questionKey: key, input: "table" },
          say: `${copy?.title ?? key}. ${prompt?.intro ?? ""}`.trim(),
          points: prompt?.points,
          detailNote: prompt?.detailNote,
          example: prompt?.example,
          // The only chip on an open question, and the reason chat mode is completable
          // with no API key at all.
          quick: [{ label: ONE_AT_A_TIME, value: { t: "fields", questionKey: key } }],
          multiSelect: false,
          freeText: true,
        };
      }

      const field = outstanding[0];
      if (field === undefined) {
        // Unreachable: validateStep said this step is incomplete, and for a table that
        // is defined as "outstandingFieldsFor is non-empty". Handled rather than
        // asserted so a future schema edit degrades into a re-ask, not a crash.
        return {
          ...base,
          id: `${key}:unknown`,
          ask: { t: "question", questionKey: key, input: "table" },
          say: copy?.title ?? key,
          quick: [],
          multiSelect: false,
          freeText: true,
        };
      }
      return fieldTurn(key, field, base);
    }
  }
}

export const ONE_AT_A_TIME = "Ask me one at a time";

const YES_NO: QuickReply[] = [
  { label: "Yes", value: { t: "bool", b: true } },
  { label: "No", value: { t: "bool", b: false } },
];

/** One outstanding detail, asked as its own question with its own controls. */
function fieldTurn(
  questionKey: string,
  field: OutstandingField,
  base: { section: string | null; progress: { answered: number; total: number } },
): Turn {
  const quick: QuickReply[] =
    field.kind === "yesno"
      ? YES_NO
      : field.kind === "options"
        ? (field.options ?? []).map((o) => ({
            label: o,
            value: { t: "option", option: o } as QuickValue,
          }))
        : [];
  return {
    ...base,
    id: `${questionKey}:${field.path}`,
    ask: { t: "field", questionKey, field },
    say: field.question,
    quick,
    multiSelect: false,
    freeText: true,
  };
}

// ---------------------------------------------------------------------------
// Applying a reply
// ---------------------------------------------------------------------------

/** A tapped chip -> store ops. No model, no network, no ambiguity. */
export function quickOps(turn: Turn, value: QuickValue, answers: Answers): Ops {
  const { ask } = turn;

  // Not an answer: it changes HOW the question is asked. The caller acts on it.
  if (value.t === "fields") return {};
  if (value.t === "sex") return { sex: value.sex };

  if (ask.t === "field") {
    if (value.t === "bool") return fieldOps(ask.questionKey, ask.field, value.b, answers);
    if (value.t === "option") return fieldOps(ask.questionKey, ask.field, value.option, answers);
    return {};
  }

  if (ask.t === "consent" && value.t === "bool") return { patch: { consent: value.b } };

  if (ask.t !== "question") return {};
  const key = ask.questionKey;

  if (value.t === "number") return { patch: { age_hair_loss_began: value.n } };
  if (value.t === "bool") return { patch: { [key]: value.b } as unknown as Partial<Answers> };
  if (value.t === "none") return { patch: { [key]: [] } as unknown as Partial<Answers>, none: [key] };

  if (ask.input === "multi") {
    const exclusive = EXCLUSIVE_OPTIONS[key];
    const current = answers[key as "family_history"];
    // Tapping the exclusive option clears the rest; tapping anything else clears it.
    if (exclusive !== undefined && value.option === exclusive)
      return { patch: { [key]: [exclusive] } as unknown as Partial<Answers> };
    const kept = exclusive === undefined ? current : current.filter((c) => c !== exclusive);
    const next = kept.includes(value.option)
      ? kept.filter((c) => c !== value.option)
      : [...kept, value.option];
    return { patch: { [key]: next } as unknown as Partial<Answers> };
  }

  return { patch: { [key]: value.option } as unknown as Partial<Answers> };
}

const YES_WORDS =
  /^(y|ya|yes|yeah|yep|yup|sure|ok|okay|correct|right|true|haan|han|ha|ji|bilkul|haa)\b/i;
const NO_WORDS = /^(n|no|nope|nah|never|false|nahi|nahin|na|bilkul nahi)\b/i;
const NONE_WORDS =
  /^(none|none of these|nothing|no ne|nahi kuch|kuch nahi|not any|no one|nobody|neither|n\/a|na)\b/i;

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[.!?,]+$/, "");
}

/**
 * Resolve a typed or spoken reply WITHOUT the model, or return null to escalate.
 *
 * Deliberately conservative. Everything here is a case where the mapping is beyond
 * argument - the reply is a yes, a no, a bare number, an option repeated word for word,
 * or a blanket denial. Anything with a hint of interpretation in it ("mostly weekly but
 * daily in summer") is the model's job, because a regex guessing at a medical answer is
 * exactly the failure this app is built to avoid.
 *
 * Returning ops rather than a value keeps the caller free of per-ask branching.
 */
export function interpretLocally(turn: Turn, text: string, answers: Answers): Ops | null {
  const t = norm(text);
  if (t.length === 0) return null;
  const { ask } = turn;

  if (ask.t === "sex") {
    if (/^(f|female|woman|girl|lady|aurat|mahila)\b/i.test(t)) return { sex: "female" };
    if (/^(m|male|man|boy|aadmi|purush)\b/i.test(t)) return { sex: "male" };
    if (/(prefer not|rather not|skip|no comment)/i.test(t)) return { sex: "prefer_not" };
    return null;
  }

  // Free-text answers ARE the answer - there is nothing to extract or interpret.
  if (ask.t === "describe") return { patch: { past_treatment_describe: text.trim() } };
  if (ask.t === "field" && ask.field.kind === "text")
    return fieldOps(ask.questionKey, ask.field, text.trim(), answers);

  // Consent: the patient's own yes or no, never a model's reading of prose.
  if (ask.t === "consent") {
    if (YES_WORDS.test(t)) return { patch: { consent: true } };
    if (NO_WORDS.test(t)) return { patch: { consent: false } };
    return null;
  }

  if (ask.t === "field") {
    if (ask.field.kind === "yesno") {
      if (YES_WORDS.test(t)) return fieldOps(ask.questionKey, ask.field, true, answers);
      if (NO_WORDS.test(t)) return fieldOps(ask.questionKey, ask.field, false, answers);
      return null;
    }
    const opt = (ask.field.options ?? []).find((o) => norm(o) === t);
    return opt === undefined ? null : fieldOps(ask.questionKey, ask.field, opt, answers);
  }

  if (ask.t !== "question") return null;
  const key = ask.questionKey;

  if (ask.input === "yesno") {
    if (YES_WORDS.test(t)) return { patch: { [key]: true } as unknown as Partial<Answers> };
    if (NO_WORDS.test(t)) return { patch: { [key]: false } as unknown as Partial<Answers> };
    return null;
  }

  if (ask.input === "number") {
    // A preset label is checked FIRST, so typing "20s" means the same as tapping the
    // "20s" chip (mid-decade). Reading the digits out of it instead would quietly make
    // the typed answer and the tapped answer differ by five years.
    const preset = AGE_PRESETS.find((p) => norm(p.label) === t);
    if (preset !== undefined) return { patch: { age_hair_loss_began: preset.value } };

    // Otherwise only a reply that is essentially just a number. "I was around 25" is
    // fine; "it started at 30 and I am 45 now" must go to the model, because picking
    // the wrong one of two numbers is a wrong medical answer.
    const digits = t.match(/\d{1,2}/g);
    if (digits?.length === 1 && t.replace(/\d/g, "").trim().length <= 14) {
      const n = Number(digits[0]);
      if (n >= 5 && n <= 90) return { patch: { age_hair_loss_began: n } };
    }
    return null;
  }

  if (ask.input === "single" || ask.input === "multi") {
    const exclusive = EXCLUSIVE_OPTIONS[key];
    const exact = turn.quick.find(
      (q) => q.value.t === "option" && norm(q.label) === t,
    );
    if (exact !== undefined && exact.value.t === "option") {
      const option = exact.value.option;
      if (ask.input !== "multi")
        return { patch: { [key]: option } as unknown as Partial<Answers> };
      /**
       * Typing an option ADDS it; it never toggles.
       *
       * A chip is a switch - tapping it twice obviously means "undo". Typed words are
       * not: a patient who says "father" twice is emphasising, not retracting, and
       * silently unselecting their answer would be a data-loss bug they could not see.
       */
      const current = answers[key as "family_history"];
      const kept =
        exclusive === undefined || option === exclusive
          ? current
          : current.filter((c) => c !== exclusive);
      if (option === exclusive) return { patch: { [key]: [exclusive] } as unknown as Partial<Answers> };
      const next = kept.includes(option) ? kept : [...kept, option];
      return { patch: { [key]: next } as unknown as Partial<Answers> };
    }
    if (NONE_WORDS.test(t)) {
      if (exclusive !== undefined)
        return { patch: { [key]: [exclusive] } as unknown as Partial<Answers> };
      if (hasNoneEscape(key))
        return { patch: { [key]: [] } as unknown as Partial<Answers>, none: [key] };
    }
    return null;
  }

  // Tables always go to the model: that is the whole point of asking them openly.
  return null;
}

// ---------------------------------------------------------------------------
// What the assistant says back
// ---------------------------------------------------------------------------

/**
 * The read-back after a reply that filled several fields at once.
 *
 * A model just wrote six medical answers from one sentence. Showing the patient a
 * progress bar and moving on treats silence as agreement, which it is not - so chat
 * mode reads the fields back and asks. Counts first ("4 of 6"), because that is the
 * honest summary and it is also the moment the patient can see the software worked.
 */
export function fillSummary(
  questionKey: string,
  answers: Answers,
): { filled: number; missing: number; lines: string[] } {
  const answered = answeredFieldsFor(questionKey, answers);
  const outstanding = outstandingFieldsFor(questionKey, answers);
  return {
    filled: answered.length,
    missing: outstanding.length,
    lines: answered.map((f) => `${f.label}: ${f.value}`),
  };
}

/** Spoken confirmation request for a multi-field fill. */
export function confirmLine(filled: number, missing: number): string {
  if (filled === 0)
    return "I could not pick anything out of that. Let me ask you one at a time instead.";
  const got =
    missing === 0
      ? `I have all ${filled}.`
      : `I got ${filled}, and ${missing} still to go.`;
  return `${got} Please check these are right.`;
}

/** A one-line acknowledgement for a single answer, so the assistant is not silent. */
export function ackLine(turn: Turn, answers: Answers): string {
  if (turn.ask.t === "consent") return answers.consent ? "Thank you." : "Noted.";
  return "Noted.";
}

/**
 * Which wizard step this turn belongs to.
 *
 * The bridge between the two modes: it is what lets "switch to the form" land on the
 * SAME question the assistant just asked, instead of dumping the patient back at Q1.
 */
export function stepIdForTurn(turn: Turn): string {
  switch (turn.ask.t) {
    case "sex":
      return "sex_gate";
    case "question":
      return turn.ask.questionKey;
    case "field":
      return turn.ask.questionKey;
    case "describe":
      return "past_treatment_side_effects";
    case "consent":
      return "consent";
    case "done":
      return "review";
  }
}

/**
 * What got recorded, in the patient's-eye view.
 *
 * Used to read a single answer back after the model interpreted prose. "My mum and my
 * sister" becoming two exact schema strings is a transformation the patient never saw,
 * so the assistant states the result: an answer the patient can correct is worth far
 * more than one they were never shown. Returns null when there is nothing meaningful to
 * echo (a tapped chip is already visible in their own bubble).
 */
export function valueEcho(questionKey: string, answers: Answers): string | null {
  const v = (answers as unknown as Record<string, unknown>)[questionKey];
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.length === 0 ? "None of these" : v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return null;
}
