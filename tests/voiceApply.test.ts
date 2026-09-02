/**
 * The client-side gate on a voice fill.
 *
 * The server validated the model's output against one schema slice; this layer exists for
 * the two rules a stateless route cannot check - the onset-age ceiling, which depends on
 * the age this patient gave, and the options closed to this patient - plus the structural
 * check that stops a reply to one question from writing another question's answer.
 *
 * These are the tests worth having because every case here is a way a WRONG CLINICAL
 * VALUE could be recorded silently. Nothing below needs a browser, a microphone or a key.
 */
import { describe, expect, it } from "vitest";
import { planVoiceFill, voiceKeyForStep } from "@/lib/voiceApply";
import { ALL_STEPS } from "@/lib/steps";
import { EMPTY_META, type Meta } from "@/lib/types";

const female: Meta = { patient_sex: "female", patient_age: 34, first_name: null };
const male: Meta = { patient_sex: "male", patient_age: 45, first_name: null };

const plan = (payload: object, key: string, meta: Meta = female) =>
  planVoiceFill(payload, key, meta, "en");

describe("what may reach the answers", () => {
  it("writes the fields the slice returned", () => {
    const p = plan({ patch: { duration: "Over a year" }, unfilled: [] }, "duration");
    expect(p.answers).toEqual({ duration: "Over a year" });
    expect(p.filled).toBe(1);
    expect(p.missing).toBe(0);
  });

  it("drops every field the answered question does not own", () => {
    /*
      Defence in depth rather than distrust of our own route: this is the last thing
      between a JSON body and a clinical record, and "it came from our own API" is not the
      same as "it is safe to spread into the answers".

      `consent` is the case that makes the rule worth being strict about. It IS one of the
      16 answers, so a filter of "must be a legal answer key" would wave it through - a
      reply about how long the hair loss has been going on could carry permission for a
      genetic test. A question may write its own field and nothing else.
    */
    const p = plan(
      {
        patch: { consent: true, patient_name: "Ramesh", duration: "6-12 months" },
        unfilled: [],
      },
      "duration",
    );
    expect(p.answers).toEqual({ duration: "6-12 months" });
    expect(p.answers).not.toHaveProperty("consent");
  });

  it("lets Q14 write the description that belongs to it, and nothing more", () => {
    const p = plan(
      {
        patch: {
          past_treatment_side_effects: true,
          past_treatment_describe: "minoxidil se khujli hui",
          sample_type: "Blood",
        },
        unfilled: [],
      },
      "past_treatment_side_effects",
    );
    expect(p.answers).toEqual({
      past_treatment_side_effects: true,
      past_treatment_describe: "minoxidil se khujli hui",
    });
  });

  it("writes nothing at all for a key with no question behind it", () => {
    expect(plan({ patch: { duration: "Over a year" } }, "made_up").answers).toEqual({});
  });

  it("survives a payload that is not shaped like a payload at all", () => {
    for (const junk of [{}, { patch: null }, { patch: "yes" }, { patch: [1, 2] }]) {
      const p = plan(junk, "duration");
      expect(p.answers).toEqual({});
      expect(p.filled).toBe(0);
    }
  });
});

describe("the onset-age ceiling", () => {
  it("accepts an age at or below the age this patient gave", () => {
    expect(plan({ patch: { age_hair_loss_began: 30 } }, "age_hair_loss_began").answers).toEqual({
      age_hair_loss_began: 30,
    });
    expect(plan({ patch: { age_hair_loss_began: 34 } }, "age_hair_loss_began").answers).toEqual({
      age_hair_loss_began: 34,
    });
  });

  it("DROPS an onset age above the patient's own age rather than clamping it", () => {
    /*
      "It started when I was 40" from a patient who told us they are 34 is a contradiction,
      not a value to be tidied. Clamping it to 34 would answer the question with a number
      nobody said, and it would look exactly like a correct fill. Dropped, the card asks
      again - which is the only honest outcome.
    */
    const p = plan({ patch: { age_hair_loss_began: 40 }, unfilled: [] }, "age_hair_loss_began");
    expect(p.answers).toEqual({});
    expect(p.missing).toBe(1);
  });

  it("has a ceiling to enforce even when the patient never gave an age", () => {
    const p = plan(
      { patch: { age_hair_loss_began: 55 } },
      "age_hair_loss_began",
      { ...EMPTY_META },
    );
    expect(p.answers).toEqual({ age_hair_loss_began: 55 });
  });

  it("refuses a fractional or non-numeric age", () => {
    for (const value of [28.5, "30", null, true]) {
      expect(plan({ patch: { age_hair_loss_began: value } }, "age_hair_loss_began").answers).toEqual(
        {},
      );
    }
  });
});

describe("options this patient may not give", () => {
  it("keeps PCOS out of a male patient's answers and says why it was left out", () => {
    // The same rule that greys the option out on screen. The microphone and the thumb
    // must not disagree about what is on offer, or a spoken answer becomes the only way
    // to put an impossible diagnosis in front of a doctor.
    const p = plan(
      { patch: { diagnosed_conditions: ["PCOS/PCOD", "Thyroid disorder"] }, unfilled: [] },
      "diagnosed_conditions",
      male,
    );
    expect(p.answers).toEqual({ diagnosed_conditions: ["Thyroid disorder"] });
    expect(p.blocked).toEqual(["PCOS/PCOD"]);
  });

  it("leaves the question unanswered when every option named was closed", () => {
    const p = plan(
      { patch: { diagnosed_conditions: ["PCOS/PCOD"] }, unfilled: [] },
      "diagnosed_conditions",
      male,
    );
    expect(p.answers).toEqual({});
    expect(p.missing).toBe(1);
    expect(p.blocked).toEqual(["PCOS/PCOD"]);
  });

  it("allows PCOS for a female patient", () => {
    const p = plan(
      { patch: { diagnosed_conditions: ["PCOS/PCOD"] } },
      "diagnosed_conditions",
      female,
    );
    expect(p.answers).toEqual({ diagnosed_conditions: ["PCOS/PCOD"] });
    expect(p.blocked).toEqual([]);
  });

  it("keeps a deliberately empty list, which is what a denial looks like", () => {
    const p = plan({ patch: { pattern: [] }, noneOf: ["pattern"] }, "pattern");
    expect(p.answers).toEqual({ pattern: [] });
    expect(p.noneOf).toEqual(["pattern"]);
  });
});

describe("the none-of-these escape", () => {
  it("is accepted only for the two questions that have no denial option", () => {
    expect(plan({ noneOf: ["pattern"] }, "pattern").noneOf).toEqual(["pattern"]);
    expect(plan({ noneOf: ["past_6_months"] }, "past_6_months").noneOf).toEqual(["past_6_months"]);
    // family_history has "No known family history" in the schema, so a denial there is a
    // real answer and must never be recorded as a UI-only flag.
    expect(plan({ noneOf: ["family_history"] }, "family_history").noneOf).toEqual([]);
  });

  it("is accepted only for the question actually being answered", () => {
    // A reply about Q4 cannot mark Q10 as denied, even if the payload says so.
    expect(plan({ noneOf: ["past_6_months"] }, "pattern").noneOf).toEqual([]);
  });
});

describe("About You", () => {
  it("writes the three meta fields", () => {
    const p = plan(
      { meta: { first_name: "Anita", patient_sex: "female", patient_age: 34 } },
      "about",
      { ...EMPTY_META },
    );
    expect(p.meta).toEqual({ first_name: "Anita", patient_sex: "female", patient_age: 34 });
    expect(p.answers).toEqual({});
    expect(p.filled).toBe(3);
  });

  it("cleans the name the same way the typed field does", () => {
    // Same function as the text input: trimmed, collapsed, and stripped of anything that
    // is not a name character, because this string is interpolated into on-screen copy.
    // Capitalisation is left alone - how someone writes their own name is their business.
    const p = plan({ meta: { first_name: "  anita  " } }, "about", { ...EMPTY_META });
    expect(p.meta.first_name).toBe("anita");

    const q = plan({ meta: { first_name: "<b>Ravi</b> 99" } }, "about", { ...EMPTY_META });
    expect(q.meta.first_name).toBe("bRavib");

    const blank = plan({ meta: { first_name: "   " } }, "about", { ...EMPTY_META });
    expect(blank.meta).not.toHaveProperty("first_name");
  });

  it("refuses an invented sex, an out-of-range age and a fractional age", () => {
    const p = plan(
      { meta: { patient_sex: "woman", patient_age: 7 } },
      "about",
      { ...EMPTY_META },
    );
    expect(p.meta).toEqual({});
    const q = plan({ meta: { patient_age: 34.5 } }, "about", { ...EMPTY_META });
    expect(q.meta).toEqual({});
  });

  it("never lets a fill CLEAR something the patient already told us", () => {
    // A null in a meta patch would read as "forget the age you gave", which is not
    // something a reply about hair loss should be able to do.
    const p = plan({ meta: { patient_age: null, patient_sex: null } }, "about", female);
    expect(p.meta).toEqual({});
  });
});

describe("the count shown to the patient", () => {
  it("counts one fact per leaf, through the nested tables", () => {
    const p = plan(
      {
        patch: {
          products: {
            "Topical Minoxidil": { used: true, duration: "3-6mo", helped: true, side_effects: false },
            Supplements: { used: false },
          },
        },
        unfilled: [],
      },
      "products",
    );
    expect(p.filled).toBe(5); // four columns on one row, plus the second row's flag
  });

  it("does not count an invariant null as an answer", () => {
    /*
      `past_treatment_describe` goes null the moment side effects are answered No. That is
      the form enforcing its own shape, not a fact the patient stated, and counting it
      would tell them they filled two answers when they gave one.
    */
    const p = plan(
      {
        patch: { past_treatment_side_effects: false, past_treatment_describe: null },
        unfilled: [],
      },
      "past_treatment_side_effects",
    );
    expect(p.filled).toBe(1);
  });

  it("counts a whole multi-select as one answer", () => {
    const p = plan(
      { patch: { pattern: ["Receding hairline", "Thinning at crown"] } },
      "pattern",
    );
    expect(p.filled).toBe(1);
  });
});

describe("voiceKeyForStep", () => {
  it("gives every step a slice except consent", () => {
    for (const step of ALL_STEPS) {
      const key = voiceKeyForStep(step);
      if (step.kind === "consent") expect(key).toBeNull();
      else if (step.kind === "about") expect(key).toBe("about");
      else expect(key).toBe(step.key);
    }
  });
});
