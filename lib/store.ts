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

  patch: (p: Partial<Answers>) => void;
  setSex: (sex: PatientSex) => void;
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

export const useIntake = create<IntakeState>()(
  persist(
    (set, get) => ({
      answers: structuredClone(EMPTY_ANSWERS),
      meta: { ...EMPTY_META },
      currentStepId: ALL_STEPS[0]!.id,
      touched: {},
      explicitNone: {},

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
          meta: { patient_sex: sex },
          answers: applySexGate(s.answers, sex),
          touched: { ...s.touched, sex_gate: true },
        })),

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
      }),
    },
  ),
);

/** Re-exported so components don't need to import from two places. */
export { isStepVisible };
