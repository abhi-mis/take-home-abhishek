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
  AGE_MAX,
  ONSET_MIN,
  COMFORT_ZOOM,
  ageBand,
  cleanFirstName,
  doneTitle,
  maxOnsetAge,
  personalNote,
  personalSummary,
  optionUnavailable,
  shouldOfferComfort,
  suggestedComfort,
  suggestionFor,
  unavailableOptions,
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

  it("offers the bigger size, and only when there is one to offer", () => {
    // The prompt is the whole mechanism now: nothing resizes without an answer.
    expect(shouldOfferComfort(meta({ patient_age: 60 }), false, false)).toBe(true);
    expect(shouldOfferComfort(meta({ patient_age: 72 }), false, false)).toBe(true);
    expect(shouldOfferComfort(meta({ patient_age: 41 }), false, false)).toBe(false);
    expect(shouldOfferComfort(meta(), false, false)).toBe(false);
  });

  it("never asks twice, whichever way the patient answered", () => {
    // Declining leaves the scale at standard, which is why "asked" has to be tracked
    // separately from "chosen" - otherwise a "no thank you" prompt returns forever.
    expect(shouldOfferComfort(meta({ patient_age: 60 }), false, true)).toBe(false);
    expect(shouldOfferComfort(meta({ patient_age: 60 }), true, false)).toBe(false);
    expect(shouldOfferComfort(meta({ patient_age: 60 }), true, true)).toBe(false);
  });

  it("names the bands for copy", () => {
    expect(ageBand(null, "en")).toBe("");
    expect(ageBand(19, "en")).toBe("under 25");
    expect(ageBand(58, "en")).toBe("55 to 69");
    expect(ageBand(75, "en")).toBe("70 or older");
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

  it("floors at the ONSET minimum rather than at the age field's", () => {
    /*
      The two constants are the same number again - 16, on the clinical point that
      androgenetic hair loss does not present before puberty completes - and the indirection
      stays because they are different facts: one is who may fill this form in, the other is
      the earliest onset the question will offer. They were briefly 1 and 5, and this test is
      what would catch `maxOnsetAge` being re-pointed at the wrong one.
    */
    expect(AGE_MIN).toBe(16);
    expect(AGE_MAX).toBe(100);
    expect(ONSET_MIN).toBe(16);
    expect(maxOnsetAge(meta({ patient_age: 3 }))).toBe(ONSET_MIN);
    expect(maxOnsetAge(meta({ patient_age: 40 }))).toBe(40);
  });
});

describe("suggestions are offers, not answers", () => {
  it("offers Menopausal to an older patient, and says why", () => {
    const s = suggestionFor("menstrual_cycle", EMPTY_ANSWERS, meta({ patient_age: 58 }), "en");
    expect(s?.value).toBe("Menopausal");
    expect(s?.reason).toContain("58");
  });

  it("suggests nothing to a younger patient", () => {
    expect(suggestionFor("menstrual_cycle", EMPTY_ANSWERS, meta({ patient_age: 29 }), "en")).toBeUndefined();
    expect(suggestionFor("pregnancy_related", EMPTY_ANSWERS, meta({ patient_age: 29 }), "en")).toBeUndefined();
  });

  it("suggests nothing once the question is answered", () => {
    const answered = { ...EMPTY_ANSWERS, menstrual_cycle: "Regular" as const };
    expect(suggestionFor("menstrual_cycle", answered, meta({ patient_age: 58 }), "en")).toBeUndefined();
  });

  it("suggests nothing at all without an age", () => {
    expect(suggestionFor("menstrual_cycle", EMPTY_ANSWERS, meta(), "en")).toBeUndefined();
  });

  it("does not touch the answers", () => {
    const before = structuredClone(EMPTY_ANSWERS);
    suggestionFor("menstrual_cycle", before, meta({ patient_age: 61 }), "en");
    suggestionFor("pregnancy_related", before, meta({ patient_age: 61 }), "en");
    // A suggestion the patient has to accept is help; one that fills itself in is a
    // fabricated medical record.
    expect(before).toEqual(EMPTY_ANSWERS);
  });

  it("offers Not applicable for pregnancy to an older patient", () => {
    const s = suggestionFor("pregnancy_related", EMPTY_ANSWERS, meta({ patient_age: 61 }), "en");
    expect(s?.value).toBe("Not applicable");
  });
});

describe("options this patient cannot truthfully pick", () => {
  it("closes PCOS/PCOD for a male patient", () => {
    expect(optionUnavailable("diagnosed_conditions", "PCOS/PCOD", meta({ patient_sex: "male" }), "en"))
      .toBeDefined();
  });

  it("leaves it open when the sex is female or was not given", () => {
    // "Prefer not to say" means we do not know, and a guess is not a reason to close an
    // option a patient may need.
    expect(optionUnavailable("diagnosed_conditions", "PCOS/PCOD", meta({ patient_sex: "female" }), "en"))
      .toBeUndefined();
    expect(optionUnavailable("diagnosed_conditions", "PCOS/PCOD", meta({ patient_sex: "prefer_not" }), "en"))
      .toBeUndefined();
    expect(optionUnavailable("diagnosed_conditions", "PCOS/PCOD", meta(), "en")).toBeUndefined();
  });

  it("closes nothing else on the same question", () => {
    const male = meta({ patient_sex: "male" });
    for (const o of ["Thyroid disorder", "Autoimmune disease", "Anemia", "None"]) {
      expect(optionUnavailable("diagnosed_conditions", o, male, "en")).toBeUndefined();
    }
  });

  it("never closes Menopausal, at any age", () => {
    // Premature ovarian insufficiency is real. A form that refuses to record it because
    // the patient is 29 has decided it knows her body better than she does.
    expect(optionUnavailable("menstrual_cycle", "Menopausal", meta({ patient_age: 24 }), "en"))
      .toBeUndefined();
  });

  it("maps a whole option list in one call", () => {
    const options = ["PCOS/PCOD", "Thyroid disorder", "Anemia"];
    const blocked = unavailableOptions("diagnosed_conditions", options, meta({ patient_sex: "male" }), "en");
    expect(Object.keys(blocked)).toEqual(["PCOS/PCOD"]);
    expect(unavailableOptions("diagnosed_conditions", options, meta({ patient_sex: "female" }), "en"))
      .toEqual({});
  });
});

describe("personalised notes", () => {
  it("reframes the hirsutism question for a female patient", () => {
    expect(personalNote("excess_body_facial_hair", meta({ patient_sex: "female" }), "en")).toMatch(
      /chin|upper lip/i,
    );
    expect(personalNote("excess_body_facial_hair", meta({ patient_sex: "male" }), "en")).toBeUndefined();
  });

  it("states the onset range using the age just given", () => {
    expect(personalNote("age_hair_loss_began", meta({ patient_age: 44 }), "en")).toContain("44");
  });

  it("adds nothing when there is nothing useful to add", () => {
    expect(personalNote("duration", meta({ patient_age: 44 }), "en")).toBeUndefined();
    expect(personalNote("menstrual_cycle", meta({ patient_age: 30 }), "en")).toBeUndefined();
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
    expect(welcomeLine(meta({ first_name: "Asha" }), "en")).toBe("Welcome, Asha");
    expect(doneTitle(meta({ first_name: "Asha" }), "All done", "en")).toBe("All done, Asha");
  });

  it("reads correctly when the patient skipped the name", () => {
    expect(welcomeLine(meta(), "en")).toBeNull();
    expect(doneTitle(meta(), "All done", "en")).toBe("All done");
  });
});

describe("the header summary", () => {
  it("says what was customised", () => {
    const line = personalSummary(meta({ patient_sex: "female", patient_age: 58 }), "en");
    expect(line).toContain("Female");
    expect(line).toContain("58");
  });

  it("leaves the text scale to the Aa button, which cannot truncate", () => {
    // It used to read "Female · 70 · largest text", which is exactly the string that
    // truncated in a one-line header at the largest scale.
    expect(personalSummary(meta({ patient_sex: "male", patient_age: 30 }), "en")).toBe("Male · 30");
  });

  it("is empty before anything is known", () => {
    expect(personalSummary(meta(), "en")).toBe("");
  });
});
