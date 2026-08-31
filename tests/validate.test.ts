/**
 * Validation + 16-key coverage. This is the "how did you verify the fill" story:
 * the output object cannot leave the app unless it passes every rule below.
 */
import { describe, expect, it } from "vitest";
import { AnswersSchema, buildOutput, validate } from "@/lib/validate";
import { QUESTIONS, TOTAL_QUESTIONS } from "@/lib/schema";
import {
  EMPTY_ANSWERS,
  PRODUCT_ROWS,
  PROCEDURE_ROWS,
  type Answers,
  type Meta,
} from "@/lib/types";

const male: Meta = { patient_sex: "male" };
const female: Meta = { patient_sex: "female" };

/** A complete, valid male intake — the baseline every test mutates one field of. */
function completeMale(): Answers {
  return {
    ...structuredClone(EMPTY_ANSWERS),
    age_hair_loss_began: 28,
    duration: "Over a year",
    family_history: ["Father had hair loss"],
    pattern: ["Receding hairline", "Thinning at crown"],
    diagnosed_conditions: ["None"],
    menstrual_cycle: null,
    pregnancy_related: null,
    adult_acne_oily_skin: true,
    excess_body_facial_hair: false,
    past_6_months: ["High stress or emotional trauma"],
    habits: {
      smoking: true,
      smoking_severity: "Moderate 5-10/day",
      alcohol: false,
      hard_water: true,
      hair_wash_frequency: "Alternate Days",
      heating_tools_styling_chemicals: false,
      salon_treatments: false,
      salon_treatment_detail: null,
    },
    products: {
      ...structuredClone(EMPTY_ANSWERS.products),
      "Topical Minoxidil": { used: true, duration: "3-6mo", helped: true, side_effects: false },
    },
    procedures: {
      ...structuredClone(EMPTY_ANSWERS.procedures),
      "PRP/GFC/iPRF": { done: true, sessions: "1-3", helped: true },
    },
    past_treatment_side_effects: false,
    past_treatment_describe: null,
    sample_type: "Saliva",
    consent: true,
  };
}

/** Every step the patient must have tapped past for full coverage. */
const ALL_TOUCHED: Record<string, true> = Object.fromEntries(
  QUESTIONS.map((q) => [q.key, true as const]),
);

describe("coverage", () => {
  it("accepts a complete male intake with both female questions null", () => {
    const r = validate(completeMale(), male, ALL_TOUCHED);
    expect(r.issues).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("counts sex-gated nulls as resolved, not missing", () => {
    const r = validate(completeMale(), male, ALL_TOUCHED);
    expect(r.missing).not.toContain("menstrual_cycle");
    expect(r.missing).not.toContain("pregnancy_related");
  });

  it("requires the two gated answers for a female patient", () => {
    const a = { ...completeMale(), menstrual_cycle: null, pregnancy_related: null };
    const r = validate(a, female, ALL_TOUCHED);
    expect(r.valid).toBe(false);
    expect(r.missing).toContain("menstrual_cycle");
    expect(r.missing).toContain("pregnancy_related");

    const filled: Answers = {
      ...a,
      menstrual_cycle: "Irregular",
      pregnancy_related: "Not applicable",
    };
    expect(validate(filled, female, ALL_TOUCHED).valid).toBe(true);
  });

  it("reports an empty form as missing all 16 keys", () => {
    const r = validate(structuredClone(EMPTY_ANSWERS), { patient_sex: null }, {});
    expect(r.valid).toBe(false);
    // menstrual/pregnancy are gated out when sex is not female, so 14 remain.
    expect(r.missing).toHaveLength(TOTAL_QUESTIONS - 2);
  });

  it("does not accept an untouched multi-select as answered", () => {
    const a = { ...completeMale(), past_6_months: [] };
    const touched = { ...ALL_TOUCHED };
    delete (touched as Record<string, unknown>).past_6_months;
    expect(validate(a, male, touched).missing).toContain("past_6_months");
    // ...but once tapped past, an empty array IS the answer.
    expect(validate(a, male, ALL_TOUCHED).valid).toBe(true);
  });

  it("requires a wash frequency inside the habits table", () => {
    const a = completeMale();
    a.habits.hair_wash_frequency = null;
    const r = validate(a, male, ALL_TOUCHED);
    expect(r.valid).toBe(false);
    expect(r.missing).toContain("habits");
  });
});

describe("gating enforced on the output, not just the UI", () => {
  it("rejects a stale menstrual answer on a male patient", () => {
    const a: Answers = { ...completeMale(), menstrual_cycle: "Regular" };
    const r = validate(a, male, ALL_TOUCHED);
    expect(r.valid).toBe(false);
    expect(r.issues.join(" ")).toMatch(/menstrual_cycle.*female/);
  });

  it("rejects a stale pregnancy answer when sex was declined", () => {
    const a: Answers = { ...completeMale(), pregnancy_related: "Currently pregnant" };
    const r = validate(a, { patient_sex: "prefer_not" }, ALL_TOUCHED);
    expect(r.valid).toBe(false);
    expect(r.issues.join(" ")).toMatch(/pregnancy_related/);
  });
});

describe("conditional followup rules", () => {
  it("needs smoking_severity when smoking is true", () => {
    const a = completeMale();
    a.habits.smoking_severity = null;
    expect(validate(a, male, ALL_TOUCHED).issues.join(" ")).toMatch(/smoking_severity/);
  });

  it("forbids smoking_severity when smoking is false", () => {
    const a = completeMale();
    a.habits.smoking = false;
    expect(validate(a, male, ALL_TOUCHED).issues.join(" ")).toMatch(/smoking_severity/);
  });

  it("pairs salon_treatments with its detail in both directions", () => {
    const on = completeMale();
    on.habits.salon_treatments = true;
    expect(validate(on, male, ALL_TOUCHED).issues.join(" ")).toMatch(/salon_treatment_detail/);

    const off = completeMale();
    off.habits.salon_treatment_detail = "keratin";
    expect(validate(off, male, ALL_TOUCHED).issues.join(" ")).toMatch(/salon_treatment_detail/);
  });

  it("requires duration/helped/side_effects only on used products", () => {
    const a = completeMale();
    a.products["Topical Minoxidil"].duration = null;
    expect(validate(a, male, ALL_TOUCHED).issues.join(" ")).toMatch(/duration/);

    const b = completeMale();
    b.products["Supplements"] = { used: false, duration: "<3mo", helped: null, side_effects: null };
    expect(validate(b, male, ALL_TOUCHED).issues.join(" ")).toMatch(/must be null when used is false/);
  });

  it("requires sessions/helped only on done procedures", () => {
    const a = completeMale();
    a.procedures["PRP/GFC/iPRF"].sessions = null;
    expect(validate(a, male, ALL_TOUCHED).issues.join(" ")).toMatch(/sessions/);

    const b = completeMale();
    b.procedures["Hair Transplant"] = { done: false, sessions: "1-3", helped: null };
    expect(validate(b, male, ALL_TOUCHED).issues.join(" ")).toMatch(/must be null when done is false/);
  });

  it("pairs Q14 with its description in both directions", () => {
    const yes = { ...completeMale(), past_treatment_side_effects: true };
    expect(validate(yes, male, ALL_TOUCHED).issues.join(" ")).toMatch(/past_treatment_describe/);

    const no = { ...completeMale(), past_treatment_describe: "khujli" };
    expect(validate(no, male, ALL_TOUCHED).issues.join(" ")).toMatch(/past_treatment_describe/);
  });
});

describe("option strings and exclusives", () => {
  it("rejects an option string that is not in the schema", () => {
    const a = { ...completeMale(), duration: "about a year" as never };
    expect(AnswersSchema.safeParse(a).success).toBe(false);
  });

  it('rejects "None" alongside a real condition', () => {
    const a = { ...completeMale(), diagnosed_conditions: ["Anemia", "None"] };
    expect(validate(a, male, ALL_TOUCHED).issues.join(" ")).toMatch(/exclusive/);
  });

  it('rejects "No known family history" alongside a real one', () => {
    const a = {
      ...completeMale(),
      family_history: ["Father had hair loss", "No known family history"],
    };
    expect(validate(a, male, ALL_TOUCHED).issues.join(" ")).toMatch(/exclusive/);
  });

  it("rejects duplicate selections", () => {
    const a = { ...completeMale(), pattern: ["Patchy loss", "Patchy loss"] };
    expect(validate(a, male, ALL_TOUCHED).issues.join(" ")).toMatch(/duplicate/);
  });

  it("requires every schema row to be present in the tables", () => {
    const a = completeMale();
    delete (a.products as Record<string, unknown>)["Supplements"];
    expect(AnswersSchema.safeParse(a).success).toBe(false);
    expect(Object.keys(completeMale().products).sort()).toEqual([...PRODUCT_ROWS].sort());
    expect(Object.keys(completeMale().procedures).sort()).toEqual([...PROCEDURE_ROWS].sort());
  });

  it("rejects an unknown table row", () => {
    const a = completeMale();
    (a.products as Record<string, unknown>)["Herbal Tea"] = {
      used: true,
      duration: "<3mo",
      helped: true,
      side_effects: false,
    };
    expect(AnswersSchema.safeParse(a).success).toBe(false);
  });
});

describe("buildOutput", () => {
  it("carries the 16 answers plus patient_sex as metadata", () => {
    const out = buildOutput(completeMale(), male);
    expect(out.patient_sex).toBe("male");
    expect(Object.keys(out.answers)).toHaveLength(17); // 16 keys + past_treatment_describe
    for (const q of QUESTIONS) expect(out.answers).toHaveProperty(q.key);
    expect(out.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
