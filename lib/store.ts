/**
 * Single Zustand store. Holds the answers, the UI-only meta, the current step id
 * and a `touched` set (which steps the patient has explicitly moved past).
 *
 * Everything the wizard needs is derived from this; there is no server state and
 * no database, per the brief. Progress is persisted to sessionStorage only so a
 * mid-form refresh on a phone doesn't wipe 15 answers.
 */
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "./persist";
import {
  EMPTY_ANSWERS,
  EMPTY_META,
  type Answers,
  type Meta,
  type PatientSex,
} from "./types";
import { suggestedComfort, type Comfort } from "./patient";
import type { Lang } from "./i18n";
import { isStepVisible } from "./steps";
import { ALL_SECTIONS, firstUnanswered, sectionById, sectionIndexById } from "./sections";

interface IntakeState {
  answers: Answers;
  meta: Meta;
  /**
   * Which of the six sections is on screen, or "review" past the end. Replaces the old
   * per-question step id: the flow is addressed a section at a time now.
   */
  currentSectionId: string;
  /**
   * Which question inside that section is expanded, by step id, or null for all collapsed.
   *
   * Persisted deliberately. A patient who refreshes should come back to the card they were
   * answering rather than to the top of the section wondering where they were.
   */
  openQuestionId: string | null;
  touched: Record<string, true>;
  /**
   * UI-only: which "None of these" controls the patient actively chose (Q4, Q10).
   * Kept out of `Answers` so the graded output stays exactly on-schema, but it is what
   * lets validation tell "deliberately empty" from "not answered yet".
   */
  explicitNone: Record<string, true>;
  /**
   * Text and tap-target scale. Derived from the patient's age when they set it, then
   * frozen the moment they touch the control themselves - an automatic default that
   * keeps overriding a deliberate choice is just a bug with good intentions.
   */
  /**
    * Display language. Presentation only - see lib/i18n.ts: answers are always stored as
    * the English schema strings, so the downloaded JSON is identical either way.
    */
  lang: Lang;

  comfort: Comfort;
  comfortChosen: boolean;
  /**
   * Has the patient answered the "would you like larger text?" prompt, either way?
   *
   * Separate from `comfortChosen` on purpose: declining leaves the scale at standard,
   * which is indistinguishable from never having been asked unless it is recorded. Both
   * flags block the prompt; only one of them means "the patient picked a size".
   */
  comfortAsked: boolean;

  patch: (p: Partial<Answers>) => void;
  setSex: (sex: PatientSex) => void;
  /** null when the field holds something out of range: not answered, not 'the old value'. */
  setAge: (age: number | null) => void;
  setFirstName: (name: string | null) => void;
  setLang: (l: Lang) => void;
  setComfort: (c: Comfort) => void;
  /** Answers the text-size prompt: yes, scale it up to the size their age suggests. */
  acceptComfort: () => void;
  /** Answers the text-size prompt: no, leave it exactly as it is. */
  declineComfort: () => void;
  /** Choose "None of these": clears the array AND records the deliberate choice. */
  chooseNone: (key: string) => void;
  markTouched: (id: string) => void;
  goToSection: (id: string) => void;
  openQuestion: (id: string | null) => void;
  nextSection: () => void;
  prevSection: () => void;
  reset: () => void;
}

/**
 * NOTE: this store deliberately exposes NO derived getters (no `steps()`, no
 * `progress()`). A getter that builds an array or object is a trap in Zustand - * `useIntake((s) => s.steps())` returns a fresh reference on every call, never
 * compares equal under Object.is, and re-renders until React throws
 * "Maximum update depth exceeded". Derive with `visibleQuestions(section, meta)` in a `useMemo`
 * at the call site instead, keyed on the state it actually depends on.
 */

/**
 * Sex changes have to rewrite answers, not just meta: switching away from "female"
 * must null the two gated answers so a stale value can never reach the output.
 */
function applySexGate(answers: Answers, sex: PatientSex): Answers {
  if (sex === "female") return answers;
  const gated: Answers = { ...answers, menstrual_cycle: null, pregnancy_related: null };
  if (sex !== "male") return gated;
  /*
    A male patient cannot have PCOS/PCOD, so an answer recorded before the sex was
    corrected has to go with it - the same reasoning as clampOnsetAge below. Leaving it
    would put a diagnosis in the output that the form itself now refuses to offer, and an
    impossible diagnosis reaching a doctor is worse than an answer the patient has to
    give again.
  */
  return {
    ...gated,
    diagnosed_conditions: gated.diagnosed_conditions.filter((c) => c !== "PCOS/PCOD"),
  };
}

/**
 * Lowering the current age has to pull the onset age down with it.
 *
 * Otherwise going back and correcting "58" to "34" leaves "hair loss began at 55"
 * sitting in the answers - past its own validation bound, and on its way to a doctor.
 */
function clampOnsetAge(answers: Answers, age: number): Answers {
  const onset = answers.age_hair_loss_began;
  if (onset === null || onset <= age) return answers;
  return { ...answers, age_hair_loss_began: age };
}

export const useIntake = create<IntakeState>()(
  persist(
    (set, get) => ({
      answers: structuredClone(EMPTY_ANSWERS),
      meta: { ...EMPTY_META },
      currentSectionId: ALL_SECTIONS[0]!.id,
      openQuestionId: ALL_SECTIONS[0]!.steps[0]?.id ?? null,
      touched: {},
      explicitNone: {},
      lang: "en",
      comfort: "standard",
      comfortChosen: false,
      comfortAsked: false,

      patch: (p) =>
        set((s) => {
          // Selecting any real option retracts a previous "None of these".
          const explicitNone = { ...s.explicitNone };
          for (const [k, v] of Object.entries(p)) {
            if (Array.isArray(v) && v.length > 0) delete explicitNone[k];
          }
          return { answers: { ...s.answers, ...p }, explicitNone };
        }),

      chooseNone: (key) =>
        set((s) => ({
          answers: { ...s.answers, [key]: [] },
          explicitNone: { ...s.explicitNone, [key]: true },
        })),

      setSex: (sex) =>
        set((s) => ({
          meta: { ...s.meta, patient_sex: sex },
          answers: applySexGate(s.answers, sex),
        })),

      setAge: (age) =>
        set((s) => ({
          meta: { ...s.meta, patient_age: age },
          // No age means no ceiling to enforce; the onset answer is left as it is.
          answers: age === null ? s.answers : clampOnsetAge(s.answers, age),
          // Deliberately does NOT touch `comfort`. An age used to resize the screen on
          // the spot; now it only makes the form eligible to ask. See ComfortPrompt.
        })),

      setFirstName: (name) => set((s) => ({ meta: { ...s.meta, first_name: name } })),

      setLang: (l) => set({ lang: l }),

      // Using the Aa button is itself an answer to the question, so it closes the prompt.
      setComfort: (c) => set({ comfort: c, comfortChosen: true, comfortAsked: true }),

      acceptComfort: () =>
        set((s) => ({
          comfort: suggestedComfort(s.meta.patient_age),
          comfortChosen: true,
          comfortAsked: true,
        })),

      // No scale change, but the answer is recorded: without this, "no thank you" is
      // indistinguishable from "not asked yet" and the prompt returns on every render.
      declineComfort: () => set({ comfortAsked: true }),

      markTouched: (id) => set((s) => ({ touched: { ...s.touched, [id]: true } })),

      /**
       * Jump to a section and open the first thing still unanswered in it.
       *
       * Landing on the first gap rather than the top means arriving at a section never
       * requires the patient to hunt for where they were - which matters most when they
       * arrive from the rail or the review screen rather than by pressing Next.
       */
      goToSection: (id) =>
        set((s) => {
          const section = sectionById(id);
          if (section === undefined) return {};
          const open = firstUnanswered(section, s.answers, s.meta, s.explicitNone);
          return { currentSectionId: id, openQuestionId: open?.id ?? null };
        }),

      openQuestion: (id) => set({ openQuestionId: id }),

      nextSection: () =>
        set((s) => {
          const i = sectionIndexById(s.currentSectionId);
          const target = ALL_SECTIONS[i + 1];
          // Past the last section we land on the review screen.
          if (target === undefined) {
            return {
              touched: { ...s.touched, [s.currentSectionId]: true },
              currentSectionId: "review",
              openQuestionId: null,
            };
          }
          const open = firstUnanswered(target, s.answers, s.meta, s.explicitNone);
          return {
            touched: { ...s.touched, [s.currentSectionId]: true },
            currentSectionId: target.id,
            openQuestionId: open?.id ?? null,
          };
        }),

      prevSection: () =>
        set((s) => {
          if (s.currentSectionId === "review") {
            const last = ALL_SECTIONS[ALL_SECTIONS.length - 1]!;
            return { currentSectionId: last.id, openQuestionId: null };
          }
          const i = sectionIndexById(s.currentSectionId);
          const target = ALL_SECTIONS[i - 1];
          if (target === undefined) return {};
          // Going back leaves everything collapsed: the patient is reviewing, not answering,
          // and opening a card for them would put the cursor somewhere they did not ask for.
          return { currentSectionId: target.id, openQuestionId: null };
        }),

      reset: () =>
        set({
          answers: structuredClone(EMPTY_ANSWERS),
          meta: { ...EMPTY_META },
          currentSectionId: ALL_SECTIONS[0]!.id,
          openQuestionId: ALL_SECTIONS[0]!.steps[0]?.id ?? null,
          touched: {},
          explicitNone: {},
          comfort: "standard",
          comfortChosen: false,
          comfortAsked: false,
          // Language is NOT reset: someone who chose Hindi wants Hindi for the next form
          // too, and unlike the comfort scale it is not derived from a patient's own age.
        }),

    }),
    {
      /*
        v2, because the persisted shape changed: currentStepId became currentSectionId plus
        an openQuestionId. A v1 session half-loading into a v2 store is worse than starting
        over, and this is sessionStorage - per tab, minutes old at most - so bumping the key
        costs a patient nothing that a refresh would not already have cost them.
      */
      name: "genoroot-intake-v2",
      storage: createJSONStorage(),
      partialize: (s) => ({
        answers: s.answers,
        meta: s.meta,
        currentSectionId: s.currentSectionId,
        openQuestionId: s.openQuestionId,
        touched: s.touched,
        explicitNone: s.explicitNone,
        // Persisted with the answers rather than in localStorage: comfort is derived
        // from THIS patient's age, so the next person on a shared clinic phone must not
        // inherit it. sessionStorage forgetting it is the correct behaviour.
        lang: s.lang,
        comfort: s.comfort,
        comfortChosen: s.comfortChosen,
        comfortAsked: s.comfortAsked,
      }),
    },
  ),
);

/** Re-exported so components don't need to import from two places. */
export { isStepVisible };
