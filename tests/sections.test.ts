/**
 * The section model.
 *
 * Everything here is structural: which questions live in a section, which of them this
 * patient can see, how many are answered, and which one to open next. Not a single string
 * of patient-facing copy, which is why none of these tests need a language.
 *
 * The one property worth stating out loud: "answered" is delegated to `validateStep`, so a
 * section can never disagree with the question inside it about whether it is done.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_SECTIONS,
  answeredCount,
  firstUnanswered,
  isAnswered,
  neighbourQuestion,
  nextUnansweredAfter,
  sectionById,
  sectionIndexById,
  validateSection,
  visibleQuestions,
} from "@/lib/sections";
import { EMPTY_ANSWERS, EMPTY_META, type Answers, type Meta } from "@/lib/types";

const meta = (over: Partial<Meta> = {}): Meta => ({ ...EMPTY_META, ...over });
const answers = (over: Partial<Answers> = {}): Answers => ({
  ...structuredClone(EMPTY_ANSWERS),
  ...over,
});
const female = meta({ patient_sex: "female", patient_age: 34 });
const male = meta({ patient_sex: "male", patient_age: 34 });

describe("the six sections", () => {
  it("is exactly the schema's taxonomy plus About You", () => {
    expect(ALL_SECTIONS.map((s) => s.id)).toEqual(["0", "A", "B", "C", "D", "E"]);
  });

  it("accounts for every step exactly once", () => {
    const total = ALL_SECTIONS.reduce((n, s) => n + s.steps.length, 0);
    expect(total).toBe(17);
    const ids = ALL_SECTIONS.flatMap((s) => s.steps.map((q) => q.id));
    expect(new Set(ids).size).toBe(17);
  });

  it("keeps schema order inside a section", () => {
    expect(sectionById("A")?.steps.map((s) => s.key)).toEqual([
      "age_hair_loss_began",
      "duration",
      "family_history",
      "pattern",
    ]);
  });

  it("finds a section by id and reports its position", () => {
    expect(sectionIndexById("B")).toBe(2);
    expect(sectionIndexById("nope")).toBe(0);
  });
});

describe("visible questions follow the sex gate", () => {
  it("shows five health questions to a female patient", () => {
    expect(visibleQuestions(sectionById("B")!, female)).toHaveLength(5);
  });

  it("shows three to a male patient", () => {
    const keys = visibleQuestions(sectionById("B")!, male).map((s) => s.key);
    expect(keys).not.toContain("menstrual_cycle");
    expect(keys).not.toContain("pregnancy_related");
    expect(keys).toHaveLength(3);
  });
});

describe("answered, counted and validated", () => {
  it("delegates answered to validateStep rather than reimplementing it", () => {
    const step = sectionById("A")!.steps[1]!; // duration
    expect(isAnswered(step, answers(), female, {})).toBe(false);
    expect(isAnswered(step, answers({ duration: "Over a year" }), female, {})).toBe(true);
  });

  it("counts only visible questions", () => {
    const b = sectionById("B")!;
    const a = answers({ diagnosed_conditions: ["Anemia"] });
    expect(answeredCount(b, a, male, {})).toBe(1);
  });

  it("is complete only when every visible question is answered", () => {
    const b = sectionById("B")!;
    const partly = answers({ diagnosed_conditions: ["Anemia"] });
    const v1 = validateSection(b, partly, male, {});
    expect(v1.complete).toBe(false);
    expect(v1.missing.map((s) => s.key)).toEqual([
      "adult_acne_oily_skin",
      "excess_body_facial_hair",
    ]);

    const done = answers({
      diagnosed_conditions: ["Anemia"],
      adult_acne_oily_skin: true,
      excess_body_facial_hair: false,
    });
    expect(validateSection(b, done, male, {}).complete).toBe(true);
  });

  it("does not require a gated question that was never asked", () => {
    const b = sectionById("B")!;
    const done = answers({
      diagnosed_conditions: ["None"],
      adult_acne_oily_skin: true,
      excess_body_facial_hair: false,
    });
    // menstrual_cycle and pregnancy_related stay null for a male patient, and that null is
    // a valid answer rather than a missing one.
    expect(validateSection(b, done, male, {}).complete).toBe(true);
  });

  it("still requires them of a female patient", () => {
    const b = sectionById("B")!;
    const done = answers({
      diagnosed_conditions: ["None"],
      adult_acne_oily_skin: true,
      excess_body_facial_hair: false,
    });
    expect(validateSection(b, done, female, {}).missing.map((s) => s.key)).toEqual([
      "menstrual_cycle",
      "pregnancy_related",
    ]);
  });

  it("counts an About You section as answered only once sex and age are set", () => {
    const zero = sectionById("0")!;
    expect(validateSection(zero, answers(), meta(), {}).complete).toBe(false);
    expect(validateSection(zero, answers(), female, {}).complete).toBe(true);
  });
});

describe("which question to open", () => {
  it("opens the first unanswered one", () => {
    const a = sectionById("A")!;
    expect(firstUnanswered(a, answers(), female, {})?.key).toBe("age_hair_loss_began");
    expect(firstUnanswered(a, answers({ age_hair_loss_began: 30 }), female, {})?.key).toBe(
      "duration",
    );
  });

  it("returns null when the section is done", () => {
    const b = sectionById("B")!;
    const done = answers({
      diagnosed_conditions: ["None"],
      adult_acne_oily_skin: false,
      excess_body_facial_hair: false,
    });
    expect(firstUnanswered(b, done, male, {})).toBeNull();
  });

  it("walks forward from a given question, skipping gated ones", () => {
    const b = sectionById("B")!;
    const from = b.steps[0]!; // diagnosed_conditions
    expect(nextUnansweredAfter(b, from, answers(), male, {})?.key).toBe("adult_acne_oily_skin");
  });

  it("stops at the end rather than wrapping to the top", () => {
    const a = sectionById("A")!;
    const last = a.steps[a.steps.length - 1]!;
    expect(nextUnansweredAfter(a, last, answers(), female, {})).toBeNull();
  });

  it("skips over questions that are already answered", () => {
    const a = sectionById("A")!;
    const partly = answers({ duration: "Over a year" });
    expect(nextUnansweredAfter(a, a.steps[0]!, partly, female, {})?.key).toBe("family_history");
  });
});

describe("neighbours, for the keyboard", () => {
  it("moves to the next and previous visible card, answered or not", () => {
    const b = sectionById("B")!;
    const first = b.steps[0]!;
    // For a male patient the two gated questions are not neighbours at all.
    expect(neighbourQuestion(b, first, male, 1)?.key).toBe("adult_acne_oily_skin");
    expect(neighbourQuestion(b, first, female, 1)?.key).toBe("menstrual_cycle");
  });

  it("returns null at either end", () => {
    const a = sectionById("A")!;
    expect(neighbourQuestion(a, a.steps[0]!, female, -1)).toBeNull();
    expect(neighbourQuestion(a, a.steps[3]!, female, 1)).toBeNull();
  });
});
