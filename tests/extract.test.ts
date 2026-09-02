/**
 * Extraction slices, tested WITHOUT the model.
 *
 * The genuinely risky part of a voice pipeline isn't the LLM call - it's what your
 * code does with a hostile or sloppy reply. So these tests feed the slice layer the
 * things a 70B open model actually produces: markdown fences, invented option
 * strings, extra keys, a followup with no trigger, a row that doesn't exist.
 *
 * Every one of them must end with either a legal patch or nothing. The LLM's own
 * accuracy is measured separately, by the fixture eval (npm run eval), which needs
 * a key and is deliberately not a CI gate.
 */
import { describe, expect, it } from "vitest";
import {
  SLICES,
  VOICE_KEYS,
  buildUserMessage,
  extractFromModelText,
  isVoiceKey,
  parseModelJson,
  pickOption,
  type VoiceKey,
} from "@/lib/extractPrompt";
import { QUESTIONS } from "@/lib/schema";
import { AnswersSchema } from "@/lib/validate";
import { EMPTY_ANSWERS, PRODUCT_ROWS, type Answers } from "@/lib/types";

/** The slices return schema-shaped patches; tests poke at them as loose records. */
const rows = (v: unknown) => (v ?? {}) as Record<string, Record<string, unknown>>;

describe("parseModelJson tolerates real model output", () => {
  it("reads bare JSON", () => {
    expect(parseModelJson('{"smoking":true}')).toEqual({ smoking: true });
  });

  it("strips ```json fences", () => {
    expect(parseModelJson('```json\n{"smoking":false}\n```')).toEqual({ smoking: false });
  });

  it("strips plain fences and surrounding prose", () => {
    expect(parseModelJson('Sure! Here you go:\n```\n{"alcohol":true}\n```\nHope that helps.')).toEqual(
      { alcohol: true },
    );
  });

  it("returns null on unparseable text instead of throwing", () => {
    expect(parseModelJson("I cannot help with that.")).toBeNull();
    expect(parseModelJson("{not json at all}")).toBeNull();
    expect(parseModelJson("")).toBeNull();
  });
});

describe("slice registry", () => {
  /*
    Derived from the schema rather than listed by hand, so adding a question to
    lib/schema.ts fails here until someone decides whether it can be spoken. A new
    question that silently has no microphone is the failure this catches: the card would
    look identical and the patient would simply find one question they cannot speak.
  */
  it("covers every question except consent, plus About You", () => {
    const speakable = QUESTIONS.map((q) => q.key).filter((k) => k !== "consent");
    expect([...VOICE_KEYS]).toEqual(["about", ...speakable]);
    for (const k of VOICE_KEYS) expect(SLICES[k].key).toBe(k);
  });

  it("refuses consent, so permission can never be model-filled", () => {
    // The one answer that may not be inferred from prose. A patient agreeing to a genetic
    // test presses the word "Yes"; they do not say something a transcriber and then a
    // model both had to guess at.
    expect(isVoiceKey("consent")).toBe(false);
    expect(isVoiceKey("something_else")).toBe(false);
    expect(isVoiceKey("habits")).toBe(true);
    expect(isVoiceKey("sample_type")).toBe(true);
  });

  it("shows each question its OWN options", () => {
    /*
      The enum aliases in lib/types reach the schema by position -
      `S[0].questions[1].options` - so handing the wrong one to a slice would show the
      model one question's options under another question's name. It would answer
      perfectly and every value would then be dropped as off-schema, which looks like a
      broken microphone rather than a wiring mistake. The slices read the schema by key;
      this is what proves it.
    */
    for (const q of QUESTIONS) {
      // consent has no options at all, so it drops out here rather than by name.
      if (!("options" in q)) continue;
      const shown = JSON.stringify(SLICES[q.key as VoiceKey].jsonSchema);
      for (const option of q.options) expect(shown).toContain(option);
    }
  });

  it("shows the model the schema's exact option strings", () => {
    const msg = buildUserMessage(SLICES.habits, "roz dhota hoon");
    expect(msg).toContain("Alternate Days");
    expect(msg).toContain("Moderate 5-10/day");
    expect(msg).toContain("roz dhota hoon");
  });

  it("escapes quotes in the transcript so the prompt cannot be broken out of", () => {
    const msg = buildUserMessage(SLICES.habits, 'he said "stop" then');
    expect(msg).not.toContain('"stop"');
    expect(msg).toContain("'stop'");
  });
});

describe("habits slice", () => {
  it("applies only what was mentioned and lists the rest as unfilled", () => {
    const r = extractFromModelText(
      "habits",
      JSON.stringify({
        smoking: true,
        smoking_severity: "Mild <5/day",
        alcohol: false,
        hard_water: null,
        hair_wash_frequency: "Daily",
        heating_tools_styling_chemicals: null,
        salon_treatments: null,
        salon_treatment_detail: null,
      }),
    )!;
    expect(r.patch.habits).toMatchObject({
      smoking: true,
      smoking_severity: "Mild <5/day",
      alcohol: false,
      hair_wash_frequency: "Daily",
    });
    expect(r.patch.habits).not.toHaveProperty("hard_water");
    expect(r.unfilled).toContain("habits.hard_water");
    expect(r.unfilled).toContain("habits.heating_tools_styling_chemicals");
  });

  it("drops an invented severity string rather than guessing a real one", () => {
    const r = extractFromModelText(
      "habits",
      JSON.stringify({ smoking: true, smoking_severity: "a lot, maybe 8 a day" }),
    )!;
    expect(r.patch.habits).toMatchObject({ smoking: true });
    expect(r.patch.habits).not.toHaveProperty("smoking_severity");
    // ...and it asks the patient to tap the missing one.
    expect(r.unfilled).toContain("habits.smoking_severity");
  });

  it("discards a followup whose trigger is false", () => {
    const r = extractFromModelText(
      "habits",
      JSON.stringify({ smoking: false, smoking_severity: "Severe >10/day" }),
    )!;
    expect(r.patch.habits).toEqual({ smoking: false });
    expect(r.unfilled).not.toContain("habits.smoking_severity");
  });

  it("discards salon detail when salon_treatments is false", () => {
    const r = extractFromModelText(
      "habits",
      JSON.stringify({ salon_treatments: false, salon_treatment_detail: "keratin" }),
    )!;
    expect(r.patch.habits).toEqual({ salon_treatments: false });
  });

  it("ignores keys that are not in the slice", () => {
    const r = extractFromModelText(
      "habits",
      JSON.stringify({ alcohol: true, patient_name: "Ramesh", consent: true }),
    )!;
    expect(r.patch.habits).toEqual({ alcohol: true });
    expect(r.patch).not.toHaveProperty("consent");
  });

  it("returns an empty patch when nothing was understood", () => {
    const r = extractFromModelText("habits", "{}")!;
    expect(r.patch).toEqual({});
  });
});

describe("products slice", () => {
  it("fills only the rows the patient named", () => {
    const r = extractFromModelText(
      "products",
      JSON.stringify({
        "Topical Minoxidil": {
          used: true,
          duration: "3-6mo",
          helped: true,
          side_effects: false,
        },
        Supplements: { used: true, duration: null, helped: null, side_effects: null },
      }),
    )!;
    const products = rows(r.patch.products);
    expect(products["Topical Minoxidil"]).toEqual({
      used: true,
      duration: "3-6mo",
      helped: true,
      side_effects: false,
    });
    // Silence about the other rows is NOT a "no" - they are left untouched.
    expect(products).not.toHaveProperty("Hair Oils/Serums");
    // A row switched on with no detail becomes a set of taps to collect.
    expect(r.unfilled).toEqual(
      expect.arrayContaining([
        "Supplements.duration",
        "Supplements.helped",
        "Supplements.side_effects",
      ]),
    );
  });

  it("never asks for detail columns on a row marked not used", () => {
    const r = extractFromModelText(
      "products",
      JSON.stringify({ "Oral Minoxidil": { used: false, duration: ">6mo", helped: true } }),
    )!;
    const products = rows(r.patch.products);
    expect(products["Oral Minoxidil"]).toEqual({ used: false });
    expect(r.unfilled).toHaveLength(0);
  });

  it("ignores a row name that is not in the schema", () => {
    const r = extractFromModelText(
      "products",
      JSON.stringify({ "Ayurvedic Powder": { used: true, duration: "<3mo" } }),
    )!;
    expect(r.patch).toEqual({});
  });

  it("skips a row where the model gave no clear used value", () => {
    const r = extractFromModelText(
      "products",
      JSON.stringify({ "Hair Oils/Serums": { used: null, duration: "<3mo" } }),
    )!;
    expect(r.patch).toEqual({});
  });

  it("produces a patch that survives the full Zod validator", () => {
    const r = extractFromModelText(
      "products",
      JSON.stringify({
        "OTC/Medicated Shampoos": {
          used: true,
          duration: "<3mo",
          helped: false,
          side_effects: false,
        },
      }),
    )!;
    const incoming = rows(r.patch.products);
    // Every unrelated field has to be fully answered, or the failure would come from
    // habits rather than from the products patch under test.
    const merged: Answers = {
      ...structuredClone(EMPTY_ANSWERS),
      habits: {
        smoking: false,
        smoking_severity: null,
        alcohol: false,
        hard_water: false,
        hair_wash_frequency: "Weekly",
        heating_tools_styling_chemicals: false,
        salon_treatments: false,
        salon_treatment_detail: null,
      },
      products: {
        ...(Object.fromEntries(
          PRODUCT_ROWS.map((r) => [
            r,
            { used: false, duration: null, helped: null, side_effects: null },
          ]),
        ) as Answers["products"]),
        ...incoming,
      } as Answers["products"],
      procedures: Object.fromEntries(
        Object.keys(EMPTY_ANSWERS.procedures).map((r) => [
          r,
          { done: false, sessions: null, helped: null },
        ]),
      ) as Answers["procedures"],
    };
    const parsed = AnswersSchema.safeParse(merged);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
    expect(Object.keys(merged.products).sort()).toEqual([...PRODUCT_ROWS].sort());
  });
});

describe("procedures slice", () => {
  it("fills sessions only for procedures marked done", () => {
    const r = extractFromModelText(
      "procedures",
      JSON.stringify({
        "PRP/GFC/iPRF": { done: true, sessions: "4-6", helped: true },
        "Hair Transplant": { done: false, sessions: "1-3", helped: false },
      }),
    )!;
    const procs = rows(r.patch.procedures);
    expect(procs["PRP/GFC/iPRF"]).toEqual({ done: true, sessions: "4-6", helped: true });
    expect(procs["Hair Transplant"]).toEqual({ done: false });
  });

  it("rejects an invented session count", () => {
    const r = extractFromModelText(
      "procedures",
      JSON.stringify({ "PRP/GFC/iPRF": { done: true, sessions: "about five", helped: true } }),
    )!;
    const procs = rows(r.patch.procedures);
    expect(procs["PRP/GFC/iPRF"]).toEqual({ done: true, helped: true });
    expect(r.unfilled).toContain("PRP/GFC/iPRF.sessions");
  });
});

describe("Q14 side effects slice", () => {
  it("keeps the description when the answer is yes", () => {
    const r = extractFromModelText(
      "past_treatment_side_effects",
      JSON.stringify({
        past_treatment_side_effects: true,
        past_treatment_describe: "minoxidil se khujli hui",
      }),
    )!;
    expect(r.patch).toEqual({
      past_treatment_side_effects: true,
      past_treatment_describe: "minoxidil se khujli hui",
    });
  });

  it("nulls the description when the answer is no", () => {
    const r = extractFromModelText(
      "past_treatment_side_effects",
      JSON.stringify({
        past_treatment_side_effects: false,
        past_treatment_describe: "kuch nahi hua",
      }),
    )!;
    expect(r.patch).toEqual({
      past_treatment_side_effects: false,
      past_treatment_describe: null,
    });
  });

  it("asks for the description when yes came back bare", () => {
    const r = extractFromModelText(
      "past_treatment_side_effects",
      JSON.stringify({ past_treatment_side_effects: true }),
    )!;
    expect(r.unfilled).toContain("past_treatment_describe");
    expect(r.patch).not.toHaveProperty("past_treatment_describe");
  });
});

describe("pickOption", () => {
  /*
    The one repair allowed anywhere in extraction, and the reason its limits are tested:
    "topical minoxidil" and "Topical Minoxidil" are the same answer, while "Not
    applicable" and "Currently pregnant" are two clinical facts. A matcher confident
    enough to bridge the second pair will eventually bridge the wrong one, so this one
    ignores case and runs of whitespace and NOTHING else.
  */
  const options = ["Currently pregnant", "Postpartum <1 year", "Not applicable"];

  it("accepts a differently-cased or loosely-spaced match", () => {
    expect(pickOption("currently pregnant", options)).toBe("Currently pregnant");
    expect(pickOption("  Not   Applicable ", options)).toBe("Not applicable");
  });

  it("refuses a partial, a near-miss, and anything that is not a string", () => {
    expect(pickOption("pregnant", options)).toBeNull();
    expect(pickOption("postpartum", options)).toBeNull();
    expect(pickOption("Currently pregnant!", options)).toBeNull();
    expect(pickOption(3, options)).toBeNull();
    expect(pickOption(null, options)).toBeNull();
    expect(pickOption("", options)).toBeNull();
  });
});

describe("About You slice", () => {
  it("writes name, sex and age to meta and never to the answers", () => {
    const r = extractFromModelText(
      "about",
      JSON.stringify({ first_name: "Anita", patient_sex: "female", patient_age: 34 }),
    )!;
    expect(r.meta).toEqual({ first_name: "Anita", patient_sex: "female", patient_age: 34 });
    // `patch` becomes the downloaded answers, and none of this is one of the 16.
    expect(r.patch).toEqual({});
    expect(r.unfilled).toEqual([]);
  });

  it("treats a missing name as complete and a missing sex as outstanding", () => {
    const r = extractFromModelText("about", JSON.stringify({ patient_age: 41 }))!;
    expect(r.meta).toEqual({ patient_age: 41 });
    expect(r.unfilled).toEqual(["patient_sex"]);
  });

  it("drops an age outside the range the form accepts, rather than clamping it", () => {
    for (const age of [8, 140, 34.5, "thirty"]) {
      const r = extractFromModelText("about", JSON.stringify({ patient_age: age }))!;
      expect(r.meta).not.toHaveProperty("patient_age");
      expect(r.unfilled).toContain("patient_age");
    }
  });

  it("reads an age written as a numeral in a string", () => {
    const r = extractFromModelText("about", JSON.stringify({ patient_age: "34" }))!;
    expect(r.meta?.patient_age).toBe(34);
  });

  it("drops an invented sex token", () => {
    const r = extractFromModelText("about", JSON.stringify({ patient_sex: "woman" }))!;
    expect(r.meta).not.toHaveProperty("patient_sex");
    expect(r.unfilled).toContain("patient_sex");
  });
});

describe("Q1 onset age slice", () => {
  it("takes an in-range whole number", () => {
    const r = extractFromModelText(
      "age_hair_loss_began",
      JSON.stringify({ age_hair_loss_began: 27 }),
    )!;
    expect(r.patch).toEqual({ age_hair_loss_began: 27 });
    expect(r.unfilled).toEqual([]);
  });

  it("refuses an age below the floor the form sets", () => {
    const r = extractFromModelText(
      "age_hair_loss_began",
      JSON.stringify({ age_hair_loss_began: 9 }),
    )!;
    expect(r.patch).toEqual({});
    expect(r.unfilled).toEqual(["age_hair_loss_began"]);
  });
});

describe("single-choice slices", () => {
  it("takes an exact option", () => {
    const r = extractFromModelText("duration", JSON.stringify({ duration: "Over a year" }))!;
    expect(r.patch).toEqual({ duration: "Over a year" });
  });

  it("drops a paraphrase rather than picking the nearest option", () => {
    // "about eight months" IS "6-12 months", and the model is asked to make that call.
    // What it may not do is send prose and have the client guess on its behalf.
    const r = extractFromModelText(
      "duration",
      JSON.stringify({ duration: "about eight months" }),
    )!;
    expect(r.patch).toEqual({});
    expect(r.unfilled).toEqual(["duration"]);
  });

  it("fills the female-only questions when they are the ones being asked", () => {
    const r = extractFromModelText(
      "menstrual_cycle",
      JSON.stringify({ menstrual_cycle: "Irregular" }),
    )!;
    expect(r.patch).toEqual({ menstrual_cycle: "Irregular" });
  });

  it("fills the sample preference", () => {
    const r = extractFromModelText("sample_type", JSON.stringify({ sample_type: "Saliva" }))!;
    expect(r.patch).toEqual({ sample_type: "Saliva" });
  });
});

describe("yes/no slices", () => {
  it("records both answers, and nothing when neither was said", () => {
    expect(
      extractFromModelText(
        "adult_acne_oily_skin",
        JSON.stringify({ adult_acne_oily_skin: true }),
      )!.patch,
    ).toEqual({ adult_acne_oily_skin: true });

    expect(
      extractFromModelText(
        "excess_body_facial_hair",
        JSON.stringify({ excess_body_facial_hair: false }),
      )!.patch,
    ).toEqual({ excess_body_facial_hair: false });

    const silent = extractFromModelText("adult_acne_oily_skin", "{}")!;
    expect(silent.patch).toEqual({});
    expect(silent.unfilled).toEqual(["adult_acne_oily_skin"]);
  });

  it("refuses a string where a boolean belongs", () => {
    const r = extractFromModelText(
      "adult_acne_oily_skin",
      JSON.stringify({ adult_acne_oily_skin: "yes" }),
    )!;
    expect(r.patch).toEqual({});
  });
});

describe("multi-select slices", () => {
  it("keeps only the options the patient named", () => {
    const r = extractFromModelText(
      "family_history",
      JSON.stringify({ selected: ["Father had hair loss", "Uncle"], none_apply: null }),
    )!;
    expect(r.patch).toEqual({ family_history: ["Father had hair loss"] });
  });

  it("de-duplicates a repeated option", () => {
    const r = extractFromModelText(
      "pattern",
      JSON.stringify({ selected: ["Patchy loss", "patchy loss"] }),
    )!;
    expect(r.patch).toEqual({ pattern: ["Patchy loss"] });
  });

  it("applies the exclusive-option rule, exactly as a tap does", () => {
    // "No known family history" cannot coexist with a named relative. Getting this wrong
    // does not look like a bug - it looks like ["Mother had hair loss", "No known family
    // history"] in the file a doctor opens.
    const r = extractFromModelText(
      "family_history",
      JSON.stringify({ selected: ["Mother had hair loss", "No known family history"] }),
    )!;
    expect(r.patch).toEqual({ family_history: ["No known family history"] });
  });

  it("turns a blanket denial into the schema's own denial option", () => {
    expect(
      extractFromModelText("family_history", JSON.stringify({ selected: [], none_apply: true }))!
        .patch,
    ).toEqual({ family_history: ["No known family history"] });

    expect(
      extractFromModelText(
        "diagnosed_conditions",
        JSON.stringify({ selected: [], none_apply: true }),
      )!.patch,
    ).toEqual({ diagnosed_conditions: ["None"] });
  });

  it("routes a denial to noneOf on the two questions that have no denial option", () => {
    /*
      Q4 and Q10 offer no "None" in the schema, and the difference between "denied
      everything" and "never asked" cannot be carried by an empty array. It goes to the
      UI-only explicitNone set instead, so the emitted JSON stays exactly on-schema.
    */
    for (const key of ["pattern", "past_6_months"] as const) {
      const r = extractFromModelText(key, JSON.stringify({ selected: [], none_apply: true }))!;
      expect(r.noneOf).toEqual([key]);
      expect(r.patch).toEqual({ [key]: [] });
    }
  });

  it("leaves the question unanswered when the reply said nothing about it", () => {
    const r = extractFromModelText("past_6_months", JSON.stringify({ selected: [] }))!;
    expect(r.patch).toEqual({});
    expect(r.noneOf ?? []).toEqual([]);
    expect(r.unfilled).toEqual(["past_6_months"]);
  });

  it("survives a scalar where the list belongs", () => {
    const r = extractFromModelText("pattern", JSON.stringify({ selected: "Patchy loss" }))!;
    expect(r.patch).toEqual({});
  });
});

describe("failure handling", () => {
  it("returns null when the model refuses or rambles", () => {
    expect(extractFromModelText("habits", "I'm sorry, I can't do that.")).toBeNull();
  });

  it("survives an array where an object was expected", () => {
    const r = extractFromModelText("products", "[1,2,3]");
    expect(r === null || Object.keys(r.patch).length === 0).toBe(true);
  });

  it("survives nulls and scalars in row positions", () => {
    const r = extractFromModelText(
      "products",
      JSON.stringify({ Supplements: "yes", "Hair Oils/Serums": null }),
    )!;
    expect(r.patch).toEqual({});
  });
});
