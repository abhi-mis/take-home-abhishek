/**
 * The slices chat mode added - every question that is not a table.
 *
 * Same contract as the table slices, and the same reason for it: a model reading prose
 * into a medical form must be allowed to say "not mentioned", and anything it invents
 * must be DROPPED rather than repaired. A near-miss option string is worse than a blank,
 * because a blank gets asked again and a near-miss gets downloaded.
 */
import { describe, expect, it } from "vitest";
import {
  CHAT_ONLY_KEYS,
  EXTRACT_KEYS,
  SLICES,
  VOICE_KEYS,
  buildUserMessage,
  extractFromModelText,
  isExtractKey,
} from "@/lib/extractPrompt";
import { DURATION, FAMILY, PATTERN, SAMPLE } from "@/lib/types";

const run = (key: string, json: unknown) => SLICES[key as keyof typeof SLICES].run(json);

describe("the extraction registry", () => {
  it("covers every question except consent", () => {
    expect(EXTRACT_KEYS.length).toBe(VOICE_KEYS.length + CHAT_ONLY_KEYS.length);
    for (const k of EXTRACT_KEYS) expect(SLICES[k].key).toBe(k);
    expect(Object.keys(SLICES).sort()).toEqual([...EXTRACT_KEYS].sort());
  });

  it("refuses consent and the sex gate, which are never model-filled", () => {
    expect(isExtractKey("consent")).toBe(false);
    expect(isExtractKey("patient_sex")).toBe(false);
    expect(isExtractKey("sample_type")).toBe(true);
  });

  it("shows the model the schema's exact option strings", () => {
    const msg = buildUserMessage(SLICES.duration, "about eight months I think");
    for (const opt of DURATION) expect(msg).toContain(opt);
  });
});

describe("single-answer slices", () => {
  it("takes an allowed option", () => {
    expect(run("duration", { value: "6-12 months" })).toEqual({
      patch: { duration: "6-12 months" },
      unfilled: [],
    });
  });

  it("drops an invented option instead of guessing the nearest", () => {
    const r = run("duration", { value: "about 8 months" });
    expect(r.patch).toEqual({});
    expect(r.unfilled).toEqual(["duration"]);
  });

  it("treats null as not mentioned", () => {
    expect(run("sample_type", { value: null }).unfilled).toEqual(["sample_type"]);
    expect(run("sample_type", {}).unfilled).toEqual(["sample_type"]);
  });

  it("accepts every option the schema actually lists", () => {
    for (const opt of SAMPLE) {
      expect(run("sample_type", { value: opt }).patch).toEqual({ sample_type: opt });
    }
  });
});

describe("yes/no slices", () => {
  it("records a real boolean and nothing else", () => {
    expect(run("adult_acne_oily_skin", { value: true }).patch).toEqual({
      adult_acne_oily_skin: true,
    });
    expect(run("excess_body_facial_hair", { value: false }).patch).toEqual({
      excess_body_facial_hair: false,
    });
  });

  it("does not read a string as a boolean", () => {
    // "maybe" must become a re-ask, not a silent yes.
    expect(run("adult_acne_oily_skin", { value: "maybe" }).unfilled).toEqual([
      "adult_acne_oily_skin",
    ]);
  });
});

describe("the age slice", () => {
  it("takes a plausible onset age", () => {
    expect(run("age_hair_loss_began", { age: 27 }).patch).toEqual({
      age_hair_loss_began: 27,
    });
  });

  it("drops an implausible age rather than clamping it", () => {
    // A clamped age is a wrong answer nobody notices; a blank gets asked again.
    expect(run("age_hair_loss_began", { age: 3 }).patch).toEqual({});
    expect(run("age_hair_loss_began", { age: 300 }).unfilled).toEqual(["age_hair_loss_began"]);
  });

  it("drops a non-integer", () => {
    expect(run("age_hair_loss_began", { age: 25.5 }).unfilled).toEqual(["age_hair_loss_began"]);
  });
});

describe("multi-select slices", () => {
  it("keeps only options that exist in the schema", () => {
    const r = run("family_history", {
      selected: ["Mother had hair loss", "Grandmother had hair loss"],
      none_of_these: null,
    });
    expect(r.patch).toEqual({ family_history: ["Mother had hair loss"] });
  });

  it("maps a blanket denial to the schema's own exclusive option", () => {
    const r = run("family_history", { selected: [], none_of_these: true });
    expect(r.patch).toEqual({ family_history: ["No known family history"] });
    expect(r.none).toBeUndefined();
  });

  it("resolves a contradiction against the denial", () => {
    // "None" plus a real condition cannot both be true; the real one is the answer that
    // matters clinically, so the blanket denial is what loses.
    const r = run("diagnosed_conditions", {
      selected: ["None", "Thyroid disorder"],
      none_of_these: null,
    });
    expect(r.patch).toEqual({ diagnosed_conditions: ["Thyroid disorder"] });
  });

  it("records a deliberate empty where the schema has no none option", () => {
    const r = run("pattern", { selected: [], none_of_these: true });
    expect(r.patch).toEqual({ pattern: [] });
    expect(r.none).toEqual(["pattern"]);
  });

  it("asks again when the reply named nothing at all", () => {
    const r = run("pattern", { selected: [], none_of_these: null });
    expect(r.patch).toEqual({});
    expect(r.unfilled).toEqual(["pattern"]);
    expect(r.none).toBeUndefined();
  });

  it("accepts every option the schema lists", () => {
    const r = run("pattern", { selected: [...PATTERN], none_of_these: false });
    expect(r.patch).toEqual({ pattern: [...PATTERN] });
    expect(FAMILY.length).toBeGreaterThan(0);
  });

  it("survives a malformed payload without throwing", () => {
    expect(run("pattern", { selected: "Patchy loss" }).unfilled).toEqual(["pattern"]);
    expect(run("family_history", null).unfilled).toEqual(["family_history"]);
    expect(run("duration", "not an object").unfilled).toEqual(["duration"]);
  });
});

describe("end to end through the text parser", () => {
  it("reads a fenced JSON reply for a chat-only question", () => {
    const r = extractFromModelText(
      "menstrual_cycle",
      '```json\n{"value": "Irregular"}\n```',
    );
    expect(r?.patch).toEqual({ menstrual_cycle: "Irregular" });
  });

  it("returns null when the model refuses instead of answering", () => {
    expect(extractFromModelText("duration", "I cannot help with medical questions.")).toBeNull();
  });
});
