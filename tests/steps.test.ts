/**
 * The step engine. These are the tests that would catch the two ways this app could
 * silently lose data: a question that never renders, and a gated question that leaves
 * a stale value behind.
 */
import { describe, expect, it } from "vitest";
import { ALL_STEPS, isStepComplete, isStepVisible, validateStep, visibleSteps } from "@/lib/steps";
import { QUESTIONS, TOTAL_QUESTIONS } from "@/lib/schema";
import { EMPTY_ANSWERS, type Meta } from "@/lib/types";

const female: Meta = { patient_sex: "female" };
const male: Meta = { patient_sex: "male" };
const declined: Meta = { patient_sex: "prefer_not" };
const unset: Meta = { patient_sex: null };

describe("step list is built from the schema", () => {
  it("has one step per question, plus the sex gate", () => {
    expect(ALL_STEPS).toHaveLength(TOTAL_QUESTIONS + 1);
    expect(TOTAL_QUESTIONS).toBe(16);
  });

  it("covers every schema question key exactly once", () => {
    const keys = ALL_STEPS.map((s) => s.key).filter((k): k is NonNullable<typeof k> => k !== null);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(QUESTIONS.map((q) => q.key).sort());
  });

  it("keeps schema order", () => {
    const numbers = ALL_STEPS.map((s) => s.n).filter((n): n is number => n !== null);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it("inserts the sex gate immediately before the first section B question", () => {
    const gateIndex = ALL_STEPS.findIndex((s) => s.id === "sex_gate");
    expect(gateIndex).toBeGreaterThan(0);
    // Everything before it is section A; the step right after it opens section B.
    expect(ALL_STEPS.slice(0, gateIndex).every((s) => s.sectionId === "A")).toBe(true);
    expect(ALL_STEPS[gateIndex + 1]?.sectionId).toBe("B");
    expect(ALL_STEPS[gateIndex + 1]?.key).toBe("diagnosed_conditions");
  });

  it("puts the gate before both female-only questions", () => {
    const gate = ALL_STEPS.findIndex((s) => s.id === "sex_gate");
    for (const key of ["menstrual_cycle", "pregnancy_related"]) {
      expect(ALL_STEPS.findIndex((s) => s.key === key)).toBeGreaterThan(gate);
    }
  });

  it("maps Q14 and Q16 to their dedicated kinds", () => {
    expect(ALL_STEPS.find((s) => s.key === "past_treatment_side_effects")?.kind).toBe(
      "yesno_describe",
    );
    expect(ALL_STEPS.find((s) => s.key === "consent")?.kind).toBe("consent");
    expect(ALL_STEPS.find((s) => s.key === "habits")?.kind).toBe("table");
  });
});

describe("sex gating", () => {
  it("shows Q6 and Q7 only for female patients", () => {
    const gated = ["menstrual_cycle", "pregnancy_related"];
    for (const key of gated) {
      const step = ALL_STEPS.find((s) => s.key === key)!;
      expect(isStepVisible(step, female)).toBe(true);
      expect(isStepVisible(step, male)).toBe(false);
      expect(isStepVisible(step, declined)).toBe(false);
      expect(isStepVisible(step, unset)).toBe(false);
    }
  });

  it("gives a female patient 17 steps and everyone else 15", () => {
    expect(visibleSteps(female)).toHaveLength(17); // 16 questions + gate
    expect(visibleSteps(male)).toHaveLength(15); // 14 questions + gate
    expect(visibleSteps(declined)).toHaveLength(15);
  });

  it("never gates a non-female-only question away", () => {
    const alwaysVisible = QUESTIONS.filter(
      (q) => q.key !== "menstrual_cycle" && q.key !== "pregnancy_related",
    );
    for (const meta of [female, male, declined, unset]) {
      const ids = new Set(visibleSteps(meta).map((s) => s.id));
      for (const q of alwaysVisible) expect(ids.has(q.key)).toBe(true);
    }
  });
});

describe("isStepComplete", () => {
  const step = (id: string) => ALL_STEPS.find((s) => s.id === id)!;

  it("blocks the gate until a sex is chosen", () => {
    expect(isStepComplete(step("sex_gate"), EMPTY_ANSWERS, unset)).toBe(false);
    expect(isStepComplete(step("sex_gate"), EMPTY_ANSWERS, male)).toBe(true);
  });

  it("requires a value for single-choice and yes/no questions", () => {
    expect(isStepComplete(step("duration"), EMPTY_ANSWERS, male)).toBe(false);
    expect(
      isStepComplete(step("duration"), { ...EMPTY_ANSWERS, duration: "Over a year" }, male),
    ).toBe(true);
    expect(isStepComplete(step("adult_acne_oily_skin"), EMPTY_ANSWERS, male)).toBe(false);
    expect(
      isStepComplete(
        step("adult_acne_oily_skin"),
        { ...EMPTY_ANSWERS, adult_acne_oily_skin: false },
        male,
      ),
    ).toBe(true);
  });

  it("BLOCKS an empty multi-select — nothing is optional", () => {
    expect(isStepComplete(step("past_6_months"), EMPTY_ANSWERS, male)).toBe(false);
    expect(validateStep(step("past_6_months"), EMPTY_ANSWERS, male).outstanding[0]).toMatch(
      /None of these/,
    );
  });

  it("accepts an empty multi-select only once “None of these” was chosen", () => {
    const none = { past_6_months: true as const };
    expect(isStepComplete(step("past_6_months"), EMPTY_ANSWERS, male, none)).toBe(true);
  });

  it("accepts a multi-select with at least one option", () => {
    const a = { ...EMPTY_ANSWERS, past_6_months: ["Recent surgery"] };
    expect(isStepComplete(step("past_6_months"), a, male)).toBe(true);
  });

  it("needs a real selection on questions that DO have a None option", () => {
    // diagnosed_conditions has "None" in the schema, so there is no UI escape hatch:
    // the patient must actively pick something, including "None".
    expect(isStepComplete(step("diagnosed_conditions"), EMPTY_ANSWERS, male)).toBe(false);
    expect(
      isStepComplete(
        step("diagnosed_conditions"),
        { ...EMPTY_ANSWERS, diagnosed_conditions: ["None"] },
        male,
      ),
    ).toBe(true);
  });

  it("requires a description when Q14 is yes", () => {
    const yes = { ...EMPTY_ANSWERS, past_treatment_side_effects: true };
    expect(isStepComplete(step("past_treatment_side_effects"), yes, male)).toBe(false);
    expect(
      isStepComplete(
        step("past_treatment_side_effects"),
        { ...yes, past_treatment_describe: "khujli hui" },
        male,
      ),
    ).toBe(true);
    // A blank-but-whitespace description does not count.
    expect(
      isStepComplete(
        step("past_treatment_side_effects"),
        { ...yes, past_treatment_describe: "   " },
        male,
      ),
    ).toBe(false);
    // "No" needs nothing further.
    expect(
      isStepComplete(
        step("past_treatment_side_effects"),
        { ...EMPTY_ANSWERS, past_treatment_side_effects: false },
        male,
      ),
    ).toBe(true);
  });
});


describe("table steps require every row to be answered", () => {
  const step = (id: string) => ALL_STEPS.find((s) => s.id === id)!;

  it("names every unanswered habits row", () => {
    const r = validateStep(step("habits"), EMPTY_ANSWERS, male);
    expect(r.complete).toBe(false);
    // 5 yes/no rows + the wash-frequency row.
    expect(r.outstanding).toHaveLength(6);
    expect(r.outstanding.join(" ")).toMatch(/Smoking/);
    expect(r.outstanding.join(" ")).toMatch(/Hair wash/);
  });

  it("asks for smoking severity only once smoking is Yes", () => {
    const a = structuredClone(EMPTY_ANSWERS);
    a.habits = {
      smoking: false,
      smoking_severity: null,
      alcohol: false,
      hard_water: false,
      hair_wash_frequency: "Daily",
      heating_tools_styling_chemicals: false,
      salon_treatments: false,
      salon_treatment_detail: null,
    };
    expect(validateStep(step("habits"), a, male).complete).toBe(true);

    a.habits.smoking = true;
    const r = validateStep(step("habits"), a, male);
    expect(r.complete).toBe(false);
    expect(r.outstanding.join(" ")).toMatch(/how much/i);
  });

  it("requires a salon detail when salon treatments is Yes", () => {
    const a = structuredClone(EMPTY_ANSWERS);
    a.habits = {
      smoking: false,
      smoking_severity: null,
      alcohol: false,
      hard_water: false,
      hair_wash_frequency: "Weekly",
      heating_tools_styling_chemicals: false,
      salon_treatments: true,
      salon_treatment_detail: null,
    };
    expect(validateStep(step("habits"), a, male).outstanding.join(" ")).toMatch(/which treatment/i);
  });

  it("names every unanswered product row, then only the used rows' details", () => {
    const empty = validateStep(step("products"), EMPTY_ANSWERS, male);
    expect(empty.outstanding).toHaveLength(5); // one per schema row

    const a = structuredClone(EMPTY_ANSWERS);
    for (const row of Object.keys(a.products) as (keyof typeof a.products)[]) {
      a.products[row] = { used: false, duration: null, helped: null, side_effects: null };
    }
    expect(validateStep(step("products"), a, male).complete).toBe(true);

    // Switching one row on adds exactly its three detail columns.
    a.products["Supplements"] = { used: true, duration: null, helped: null, side_effects: null };
    const r = validateStep(step("products"), a, male);
    expect(r.outstanding).toHaveLength(3);
    expect(r.outstanding.every((o) => o.startsWith("Supplements"))).toBe(true);
  });

  it("requires sessions and helped on a procedure marked done", () => {
    const a = structuredClone(EMPTY_ANSWERS);
    for (const row of Object.keys(a.procedures) as (keyof typeof a.procedures)[]) {
      a.procedures[row] = { done: false, sessions: null, helped: null };
    }
    expect(validateStep(step("procedures"), a, male).complete).toBe(true);

    a.procedures["Hair Transplant"] = { done: true, sessions: null, helped: null };
    const r = validateStep(step("procedures"), a, male);
    expect(r.outstanding).toHaveLength(2);
  });
});

describe("validation messages are patient-readable English", () => {
  it("never leaks a field name or code into an outstanding message", () => {
    for (const st of ALL_STEPS) {
      for (const msg of validateStep(st, EMPTY_ANSWERS, { patient_sex: null }).outstanding) {
        expect(msg).not.toMatch(/_/); // no snake_case identifiers
        expect(msg[0]).toBe(msg[0]!.toUpperCase());
      }
    }
  });
});
