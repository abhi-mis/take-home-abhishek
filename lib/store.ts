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
import { ALL_STEPS, isStepVisible, visibleSteps } from "./steps";

interface IntakeState {
  answers: Answers;
  meta: Meta;
  currentStepId: string;
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
  setAge: (age: number) => void;
  setFirstName: (name: string | null) => void;
  setComfort: (c: Comfort) => void;
  /** Answers the text-size prompt: yes, scale it up to the size their age suggests. */
  acceptComfort: () => void;
  /** Answers the text-size prompt: no, leave it exactly as it is. */
  declineComfort: () => void;
  /** Choose "None of these": clears the array AND records the deliberate choice. */
  chooseNone: (key: string) => void;
  markTouched: (id: string) => void;
  goTo: (id: string) => void;
  next: () => void;
  back: () => void;
  reset: () => void;
}

/**
 * NOTE: this store deliberately exposes NO derived getters (no `steps()`, no
 * `progress()`). A getter that builds an array or object is a trap in Zustand - * `useIntake((s) => s.steps())` returns a fresh reference on every call, never
 * compares equal under Object.is, and re-renders until React throws
 * "Maximum update depth exceeded". Derive with `visibleSteps(meta)` in a `useMemo`
 * at the call site instead, keyed on the state it actually depends on.
 */

/**
 * Sex changes have to rewrite answers, not just meta: switching away from "female"
 * must null the two gated answers so a stale value can never reach the output.
 */
function applySexGate(answers: Answers, sex: PatientSex): Answers {
  if (sex === "female") return answers;
  return { ...answers, menstrual_cycle: null, pregnancy_related: null };
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
      currentStepId: ALL_STEPS[0]!.id,
      touched: {},
      explicitNone: {},
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
          answers: clampOnsetAge(s.answers, age),
          // Deliberately does NOT touch `comfort`. An age used to resize the screen on
          // the spot; now it only makes the form eligible to ask. See ComfortPrompt.
        })),

      setFirstName: (name) => set((s) => ({ meta: { ...s.meta, first_name: name } })),

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

      goTo: (id) => set({ currentStepId: id }),

      next: () => {
        const { currentStepId, meta } = get();
        const steps = visibleSteps(meta);
        const i = steps.findIndex((s) => s.id === currentStepId);
        set((s) => ({
          touched: { ...s.touched, [currentStepId]: true },
          // Past the last step we land on the review screen.
          currentStepId: i >= 0 && i < steps.length - 1 ? steps[i + 1]!.id : "review",
        }));
      },

      back: () => {
        const { currentStepId, meta } = get();
        const steps = visibleSteps(meta);
        if (currentStepId === "review") {
          set({ currentStepId: steps[steps.length - 1]!.id });
          return;
        }
        const i = steps.findIndex((s) => s.id === currentStepId);
        if (i > 0) set({ currentStepId: steps[i - 1]!.id });
      },

      reset: () =>
        set({
          answers: structuredClone(EMPTY_ANSWERS),
          meta: { ...EMPTY_META },
          currentStepId: ALL_STEPS[0]!.id,
          touched: {},
          explicitNone: {},
          comfort: "standard",
          comfortChosen: false,
          comfortAsked: false,
        }),

    }),
    {
      name: "genoroot-intake-v1",
      storage: createJSONStorage(),
      partialize: (s) => ({
        answers: s.answers,
        meta: s.meta,
        currentStepId: s.currentStepId,
        touched: s.touched,
        explicitNone: s.explicitNone,
        // Persisted with the answers rather than in localStorage: comfort is derived
        // from THIS patient's age, so the next person on a shared clinic phone must not
        // inherit it. sessionStorage forgetting it is the correct behaviour.
        comfort: s.comfort,
        comfortChosen: s.comfortChosen,
        comfortAsked: s.comfortAsked,
      }),
    },
  ),
);

/** Re-exported so components don't need to import from two places. */
export { isStepVisible };
