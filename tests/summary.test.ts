/**
 * What a collapsed card says.
 *
 * A collapsed row has about 46px and roughly half its width for the answer, so these
 * strings are written to fit rather than derived from the question. The rules worth
 * testing: an unanswered question never reads as an answer, a multi-select does not
 * overflow, a table is summarised by coverage rather than by a value, and a patient's own
 * free text is shown as they wrote it.
 */
import { describe, expect, it } from "vitest";
import { answerSummary, shortLabel } from "@/lib/summary";
import { sectionById } from "@/lib/sections";
import { EMPTY_ANSWERS, EMPTY_META, type Answers, type Meta } from "@/lib/types";

const meta = (over: Partial<Meta> = {}): Meta => ({ ...EMPTY_META, ...over });
const answers = (over: Partial<Answers> = {}): Answers => ({
  ...structuredClone(EMPTY_ANSWERS),
  ...over,
});
const female = meta({ patient_sex: "female", patient_age: 34 });
const step = (sec: string, key: string) => sectionById(sec)!.steps.find((s) => s.key === key)!;

describe("short labels", () => {
  it("is short enough for a collapsed row, in both languages", () => {
    const s = step("B", "diagnosed_conditions");
    expect(shortLabel(s, "en")).toBe("Diagnosed");
    expect(shortLabel(s, "hi").length).toBeLessThan(24);
  });

  it("labels the About You card", () => {
    expect(shortLabel(sectionById("0")!.steps[0]!, "en")).toBe("About you");
  });

  it("has a label for every one of the seventeen cards", () => {
    for (const section of ["0", "A", "B", "C", "D", "E"]) {
      for (const s of sectionById(section)!.steps) {
        // A missing entry falls back to the step id, which would be a visible bug.
        expect(shortLabel(s, "en"), `no short label for ${s.id}`).not.toBe(s.id);
        expect(shortLabel(s, "hi"), `no Hindi short label for ${s.id}`).not.toBe(s.id);
      }
    }
  });
});

describe("answer summaries", () => {
  it("says nothing was answered rather than inventing a value", () => {
    expect(answerSummary(step("A", "duration"), answers(), female, "en")).toBe("Not answered yet");
  });

  it("shows a single choice in the patient's language", () => {
    const a = answers({ duration: "Over a year" });
    expect(answerSummary(step("A", "duration"), a, female, "en")).toBe("Over a year");
    expect(answerSummary(step("A", "duration"), a, female, "hi")).toBe("एक साल से ज़्यादा");
  });

  it("caps a multi-select instead of overflowing the row", () => {
    const a = answers({ diagnosed_conditions: ["PCOS/PCOD", "Thyroid disorder", "Anemia"] });
    // English keeps the schema string verbatim; the spaced "PCOS / PCOD" is the Hindi label.
    expect(answerSummary(step("B", "diagnosed_conditions"), a, female, "en")).toBe("PCOS/PCOD +2");
    expect(answerSummary(step("B", "diagnosed_conditions"), a, female, "hi")).toBe(
      "PCOS / PCOD +2",
    );
  });

  it("reads an explicit empty answer as None, not as unanswered", () => {
    const a = answers({ pattern: [] });
    expect(answerSummary(step("A", "pattern"), a, female, "en")).toBe("None");
  });

  it("states what consent covers rather than just Yes", () => {
    const a = answers({ consent: true });
    expect(answerSummary(step("E", "consent"), a, female, "en")).toBe(
      "Yes, I agree: sample and genetic analysis",
    );
  });

  it("summarises a table by coverage, since one value would misrepresent five rows", () => {
    const a = answers();
    a.products["Topical Minoxidil"] = {
      used: true,
      duration: "3-6mo",
      helped: true,
      side_effects: false,
    };
    a.products["Hair Oils/Serums"] = {
      used: false,
      duration: null,
      helped: null,
      side_effects: null,
    };
    expect(answerSummary(step("D", "products"), a, female, "en")).toBe("2 answered, 1 in use");
  });

  it("says a table is unanswered when no row has been touched", () => {
    expect(answerSummary(step("D", "procedures"), answers(), female, "en")).toBe(
      "Not answered yet",
    );
  });

  it("shows the patient's own words verbatim", () => {
    const a = answers({
      past_treatment_side_effects: true,
      past_treatment_describe: "minoxidil made my scalp itch",
    });
    expect(answerSummary(step("D", "past_treatment_side_effects"), a, female, "en")).toBe(
      "Yes: minoxidil made my scalp itch",
    );
  });

  it("summarises About You from the meta, not the answers", () => {
    expect(answerSummary(sectionById("0")!.steps[0]!, answers(), female, "en")).toBe("Female · 34");
  });

  it("renders an age as an age, not a bare number", () => {
    const a = answers({ age_hair_loss_began: 25 });
    expect(answerSummary(step("A", "age_hair_loss_began"), a, female, "en")).toBe("25 years old");
  });
});
