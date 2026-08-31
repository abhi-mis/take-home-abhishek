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
} from "@/lib/extractPrompt";
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
  it("covers exactly Q11, Q12, Q13, Q14", () => {
    expect([...VOICE_KEYS]).toEqual([
      "habits",
      "products",
      "procedures",
      "past_treatment_side_effects",
    ]);
    for (const k of VOICE_KEYS) expect(SLICES[k].key).toBe(k);
  });

  it("refuses non-voice keys, so consent can never be model-filled", () => {
    expect(isVoiceKey("consent")).toBe(false);
    expect(isVoiceKey("sample_type")).toBe(false);
    expect(isVoiceKey("habits")).toBe(true);
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
