/**
 * Personalisation rules.
 *
 * These are worth testing precisely because they are the kind of thing that quietly
 * becomes wrong: a comfort threshold that stops firing, an onset-age ceiling that lets an
 * impossible answer through, or - the one that actually matters clinically - a
 * "suggestion" that silently becomes an answer.
 *
 * The last one has a test of its own intent: `suggestionFor` must return a suggestion and
 * NOTHING else. It is never allowed to touch `answers`.
 */
import { describe, expect, it } from "vitest";
import {
  AGE_MIN,
  COMFORT_ZOOM,
  ageBand,
  cleanFirstName,
  doneTitle,
  maxOnsetAge,
  personalNote,
  personalSummary,
  suggestedComfort,
  suggestionFor,
  welcomeLine,
} from "@/lib/patient";
import { EMPTY_ANSWERS, EMPTY_META, type Meta } from "@/lib/types";

const meta = (over: Partial<Meta> = {}): Meta => ({ ...EMPTY_META, ...over });

describe("comfort scale", () => {
  it("leaves younger patients alone and scales up with age", () => {
    expect(suggestedComfort(null)).toBe("standard");
    expect(suggestedComfort(24)).toBe("standard");
    expect(suggestedComfort(54)).toBe("standard");
    expect(suggestedComfort(55)).toBe("large");
    expect(suggestedComfort(69)).toBe("large");
    expect(suggestedComfort(70)).toBe("xl");
    expect(suggestedComfort(88)).toBe("xl");
  });

  it("actually scales - every step is bigger than the last", () => {
    // A label that says "larger text" while rendering the same size is worse than none.
    expect(COMFORT_ZOOM.standard).toBe(1);
    expect(COMFORT_ZOOM.large).toBeGreaterThan(COMFORT_ZOOM.standard);
    expect(COMFORT_ZOOM.xl).toBeGreaterThan(COMFORT_ZOOM.large);
  });

  it("names the bands for copy", () => {
    expect(ageBand(null)).toBe("");
    expect(ageBand(19)).toBe("under 25");
    expect(ageBand(58)).toBe("55 to 69");
    expect(ageBand(75)).toBe("70 or older");
  });
});

describe("the onset-age ceiling", () => {
  it("caps the onset age at the patient's own age", () => {
    // The bug this prevents: a 45-year-old sliding "hair loss began" to 60, which then
    // reaches the doctor looking like a fact.
    expect(maxOnsetAge(meta({ patient_age: 45 }))).toBe(45);
    expect(maxOnsetAge(meta({ patient_age: 72 }))).toBe(72);
  });

  it("falls back to a sane bound when no age was given", () => {
    expect(maxOnsetAge(meta())).toBe(90);
  });

  it("never returns a ceiling below the floor", () => {
    expect(maxOnsetAge(meta({ patient_age: 3 }))).toBeGreaterThanOrEqual(AGE_MIN);
  });
});

describe("suggestions are offers, not answers", () => {
  it("offers Menopausal to an older patient, and says why", () => {
    const s = suggestionFor("menstrual_cycle", EMPTY_ANSWERS, meta({ patient_age: 58 }));
    expect(s?.value).toBe("Menopausal");
    expect(s?.reason).toContain("58");
  });

  it("suggests nothing to a younger patient", () => {
    expect(suggestionFor("menstrual_cycle", EMPTY_ANSWERS, meta({ patient_age: 29 }))).toBeUndefined();
    expect(suggestionFor("pregnancy_related", EMPTY_ANSWERS, meta({ patient_age: 29 }))).toBeUndefined();
  });

  it("suggests nothing once the question is answered", () => {
    const answered = { ...EMPTY_ANSWERS, menstrual_cycle: "Regular" as const };
    expect(suggestionFor("menstrual_cycle", answered, meta({ patient_age: 58 }))).toBeUndefined();
  });

  it("suggests nothing at all without an age", () => {
    expect(suggestionFor("menstrual_cycle", EMPTY_ANSWERS, meta())).toBeUndefined();
  });

  it("does not touch the answers", () => {
    const before = structuredClone(EMPTY_ANSWERS);
    suggestionFor("menstrual_cycle", before, meta({ patient_age: 61 }));
    suggestionFor("pregnancy_related", before, meta({ patient_age: 61 }));
    // A suggestion the patient has to accept is help; one that fills itself in is a
    // fabricated medical record.
    expect(before).toEqual(EMPTY_ANSWERS);
  });

  it("offers Not applicable for pregnancy to an older patient", () => {
    const s = suggestionFor("pregnancy_related", EMPTY_ANSWERS, meta({ patient_age: 61 }));
    expect(s?.value).toBe("Not applicable");
  });
});

describe("personalised notes", () => {
  it("reframes the hirsutism question for a female patient", () => {
    expect(personalNote("excess_body_facial_hair", meta({ patient_sex: "female" }))).toMatch(
      /chin|upper lip/i,
    );
    expect(personalNote("excess_body_facial_hair", meta({ patient_sex: "male" }))).toBeUndefined();
  });

  it("states the onset range using the age just given", () => {
    expect(personalNote("age_hair_loss_began", meta({ patient_age: 44 }))).toContain("44");
  });

  it("adds nothing when there is nothing useful to add", () => {
    expect(personalNote("duration", meta({ patient_age: 44 }))).toBeUndefined();
    expect(personalNote("menstrual_cycle", meta({ patient_age: 30 }))).toBeUndefined();
  });
});

describe("first name handling", () => {
  it("keeps real names, including non-Latin scripts and punctuation", () => {
    expect(cleanFirstName("Asha")).toBe("Asha");
    expect(cleanFirstName("  Mary-Jane  ")).toBe("Mary-Jane");
    expect(cleanFirstName("O'Brien")).toBe("O'Brien");
    expect(cleanFirstName("अंजलि")).toBe("अंजलि");
  });

  it("treats blank as not provided", () => {
    expect(cleanFirstName("")).toBeNull();
    expect(cleanFirstName("   ")).toBeNull();
    expect(cleanFirstName("!!!")).toBeNull();
  });

  it("strips markup and caps the length, because this string is rendered", () => {
    expect(cleanFirstName("<script>alert(1)</script>")).not.toContain("<");
    expect((cleanFirstName("a".repeat(200)) ?? "").length).toBeLessThanOrEqual(24);
  });

  it("shows the name back to the patient once it is given", () => {
    // A name that is asked for and never shown is a field taking something for nothing.
    expect(welcomeLine(meta({ first_name: "Asha" }))).toBe("Welcome, Asha");
    expect(doneTitle(meta({ first_name: "Asha" }), "All done")).toBe("All done, Asha");
  });

  it("reads correctly when the patient skipped the name", () => {
    expect(welcomeLine(meta())).toBeNull();
    expect(doneTitle(meta(), "All done")).toBe("All done");
  });
});

describe("the header summary", () => {
  it("says what was customised", () => {
    const line = personalSummary(meta({ patient_sex: "female", patient_age: 58 }));
    expect(line).toContain("Female");
    expect(line).toContain("58");
  });

  it("leaves the text scale to the Aa button, which cannot truncate", () => {
    // It used to read "Female · 70 · largest text", which is exactly the string that
    // truncated in a one-line header at the largest scale.
    expect(personalSummary(meta({ patient_sex: "male", patient_age: 30 }))).toBe("Male · 30");
  });

  it("is empty before anything is known", () => {
    expect(personalSummary(meta())).toBe("");
  });
});
